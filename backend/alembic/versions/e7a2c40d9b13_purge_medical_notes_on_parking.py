"""purge stored medical notes now that the feature is parked

The medical-notes feature (M3g, moved client-side in M22) was parked on 2026-09-02 — see
`docs/adr/safety-privacy.md` "Parked (2026-09-02)". The decision was that a pre-alpha app
should not be carrying special-category health data for a surface it does not offer.

Parking the *surface* is `Api/features.py`. This migration is the other half: the data
already collected under the feature comes out of the database, so the parked state is
"we do not hold this", not "we hold it but hide it". A row nulled here also disappears
from the next `pg_dump`, which is what actually retires it from the offsite backup set
(`scripts/backup-db.sh`) once the retention window rolls over.

**Keypairs are deliberately kept.** `users.public_key` and the wrapped private key are
generic X25519 material, not health data, and every account already has one generated at
registration. Dropping them would force every existing user through a re-generation
prompt for a feature that is off, and would make unparking a migration rather than an
environment variable.

What is cleared:

  - `users.medical_notes_ciphertext / _nonce / _salt`  — the member's own sealed notes
  - `users.medical_notes_consent_at`                   — the consent record for notes that no longer exist
  - `users.medical_notes_reset_at`                     — drives a "re-enter your notes" prompt with nowhere to go
  - `trip_member.medical_notes_ciphertext / _nonce / _salt`
  - `trip_member.medical_notes_leader_ciphertext / _nonce / _ephemeral_key`
  - `trip_member.medical_notes_consent_at`
  - every row of `medical_notes_access_log`            — a read log for records that are gone

**`downgrade()` is a no-op, and cannot be anything else.** The plaintext was never on the
server (M22), and the ciphertext is deleted here; nothing in this process can put it back.
The down leg exists so the revision is still traversable, not to restore data. Restoring
would mean a database restore from a backup taken before this ran.

Columns are left in place. Parking is reversible by design, and dropping the columns would
turn "flip an environment variable" back into a schema change.

Revision ID: e7a2c40d9b13
Revises: d4e8b03c1f27
Create Date: 2026-09-02

"""
import logging

from alembic import op

revision = 'e7a2c40d9b13'
down_revision = 'd4e8b03c1f27'
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    connection = op.get_bind()

    # Counted before the update so the log line reports what was actually destroyed. This
    # is the only record that will exist of how much data the parking decision removed.
    users_held = connection.exec_driver_sql(
        "SELECT count(*) FROM users WHERE medical_notes_ciphertext IS NOT NULL"
    ).scalar_one()
    members_held = connection.exec_driver_sql(
        "SELECT count(*) FROM trip_member"
        " WHERE medical_notes_ciphertext IS NOT NULL"
        " OR medical_notes_leader_ciphertext IS NOT NULL"
    ).scalar_one()
    reads_logged = connection.exec_driver_sql(
        "SELECT count(*) FROM medical_notes_access_log"
    ).scalar_one()

    connection.exec_driver_sql(
        """
        UPDATE users SET
            medical_notes_ciphertext = NULL,
            medical_notes_nonce = NULL,
            medical_notes_salt = NULL,
            medical_notes_consent_at = NULL,
            medical_notes_reset_at = NULL
        WHERE medical_notes_ciphertext IS NOT NULL
           OR medical_notes_nonce IS NOT NULL
           OR medical_notes_salt IS NOT NULL
           OR medical_notes_consent_at IS NOT NULL
           OR medical_notes_reset_at IS NOT NULL
        """
    )
    connection.exec_driver_sql(
        """
        UPDATE trip_member SET
            medical_notes_ciphertext = NULL,
            medical_notes_nonce = NULL,
            medical_notes_salt = NULL,
            medical_notes_leader_ciphertext = NULL,
            medical_notes_leader_nonce = NULL,
            medical_notes_leader_ephemeral_key = NULL,
            medical_notes_consent_at = NULL
        WHERE medical_notes_ciphertext IS NOT NULL
           OR medical_notes_leader_ciphertext IS NOT NULL
           OR medical_notes_consent_at IS NOT NULL
        """
    )
    connection.exec_driver_sql("DELETE FROM medical_notes_access_log")

    logger.info(
        "medical_notes_purged users=%s trip_members=%s access_log_rows=%s",
        users_held,
        members_held,
        reads_logged,
    )


def downgrade() -> None:
    """Intentionally empty — see the module docstring. Deleted ciphertext does not come
    back, and the server never held the plaintext to begin with."""
