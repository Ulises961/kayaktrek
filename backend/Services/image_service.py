import logging
from typing import List
from uuid import UUID

from sqlalchemy.exc import NoResultFound, IntegrityError
import uuid_extension

from Models.image import Image
from Models.point import Point
from Models.point_has_image import PointHasImage
from Schemas.image_schema import ImageSchema
from Services.storage_service import StorageService, StorageValidationError
from Api.database import db

logger = logging.getLogger(__name__)


class ImageService:

    @staticmethod
    def get_image_by_id(image_id: str) -> Image:
        """
        Retrieve an image by its ID.

        Args:
            image_id: The ID of the image to retrieve

        Returns:
            Image object if found

        Raises:
            NoResultFound: If image doesn't exist
        """
        image = db.session.query(Image).filter_by(id=UUID(image_id)).first()
        if not image:
            raise NoResultFound(f"Image {image_id} not found")
        return image

    @staticmethod
    def get_images_by_point(point_id: str) -> List[Image]:
        """
        Retrieve all images attached to a specific point.

        Args:
            point_id: The ID of the point

        Returns:
            List of Image objects ordered by insertion
        """
        images = (
            db.session.query(Image)
            .join(PointHasImage, Image.id == PointHasImage.c.image_id)
            .filter(PointHasImage.c.point_id == UUID(point_id))
            .all()
        )
        return images

    @staticmethod
    def upload_for_point(point_id: str, file_bytes: bytes, filename: str) -> Image:
        """
        Validate and upload a file to object storage, persist the Image record,
        and attach it to the given point in a single transaction.

        Args:
            point_id: The ID of the point to attach the image to
            file_bytes: Raw file content read from the multipart upload
            filename: Original filename from the client (stored as metadata only)

        Returns:
            The newly created and persisted Image object

        Raises:
            NoResultFound: If the point does not exist
            StorageValidationError: If the file fails size or MIME type checks
        """
        point = db.session.get(Point, UUID(point_id))
        if not point:
            raise NoResultFound(f"Point {point_id} not found")

        object_key = str(uuid_extension.uuid7())
        url = StorageService.upload(file_bytes, object_key, kind="image")

        try:
            image = ImageSchema().load({
                "name": filename,
                "size": len(file_bytes),
                "location": url,
            })
            db.session.add(image)
            point.images.append(image)
            db.session.commit()
        except Exception:
            # DB failed after MinIO succeeded — best-effort rollback to avoid orphan
            try:
                StorageService.delete(object_key, kind="image")
            except Exception as cleanup_err:
                logger.error(
                    "Orphaned MinIO object '%s' after DB failure — manual cleanup required. Error: %s",
                    object_key, cleanup_err,
                )
            raise

        db.session.refresh(image)
        logger.info("Image %s uploaded and attached to point %s", image.id, point_id)
        return image

    @staticmethod
    def delete_from_point(image_id: str, point_id: str) -> None:
        """
        Detach an image from a point, remove it from object storage, and delete
        the database record.

        Args:
            image_id: The ID of the image to remove
            point_id: The ID of the point the image is attached to

        Raises:
            NoResultFound: If the image or point does not exist
        """
        image = ImageService.get_image_by_id(image_id)
        point = db.session.get(Point, UUID(point_id))
        if not point:
            raise NoResultFound(f"Point {point_id} not found")

        if image in point.images:
            point.images.remove(image)

        # Capture the storage key before deleting the record
        object_key = image.location.split("/point-images/")[-1] if image.location else None

        # DB is committed first — if this fails, the record survives and the URL stays valid
        db.session.delete(image)
        db.session.commit()

        # MinIO delete is best-effort after the DB is clean; a failure leaves an
        # orphaned object in storage (invisible to users) rather than a broken URL
        if object_key:
            try:
                StorageService.delete(object_key, kind="image")
            except Exception as e:
                logger.error(
                    "Orphaned MinIO object 'point-images/%s' after DB delete — manual cleanup required. Error: %s",
                    object_key, e,
                )

        logger.info("Image %s removed from point %s", image_id, point_id)
