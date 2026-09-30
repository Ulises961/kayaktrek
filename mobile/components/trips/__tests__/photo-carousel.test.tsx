import { fireEvent, render } from "@testing-library/react-native";

import type { Image } from "@shared/dtos/image";

import { PhotoCarousel } from "../photo-carousel";

function image(id: string, overrides: Partial<Image> = {}): Image {
  return {
    id,
    size: 1024,
    name: `${id}.jpg`,
    location: `r2://${id}`,
    isPublic: false,
    ...overrides,
  };
}

describe("PhotoCarousel", () => {
  it("renders nothing for a point with no photos", async () => {
    const { toJSON } = await render(<PhotoCarousel images={[]} />);

    expect(toJSON()).toBeNull();
  });

  it("shows a thumbnail per photo, and no viewer until one is tapped", async () => {
    const { getByTestId, queryByLabelText } = await render(
      <PhotoCarousel images={[image("a"), image("b")]} />,
    );

    expect(getByTestId("photo-thumbnail-0")).toBeTruthy();
    expect(getByTestId("photo-thumbnail-1")).toBeTruthy();
    expect(queryByLabelText("Close photo viewer")).toBeNull();
  });

  it("opens the fullscreen viewer on a thumbnail, showing the count", async () => {
    const { getByTestId, getByText, getByLabelText } = await render(
      <PhotoCarousel images={[image("a"), image("b")]} />,
    );

    await fireEvent.press(getByTestId("photo-thumbnail-0"));

    expect(getByLabelText("Close photo viewer")).toBeTruthy();
    expect(getByText("1 / 2")).toBeTruthy();
  });

  it("cycles forward and wraps around", async () => {
    const { getByTestId, getByText, getByLabelText } = await render(
      <PhotoCarousel images={[image("a"), image("b")]} />,
    );

    await fireEvent.press(getByTestId("photo-thumbnail-0"));
    await fireEvent.press(getByLabelText("Next photo"));
    expect(getByText("2 / 2")).toBeTruthy();

    await fireEvent.press(getByLabelText("Next photo"));
    expect(getByText("1 / 2")).toBeTruthy();
  });

  it("cycles backward and wraps around", async () => {
    const { getByTestId, getByText, getByLabelText } = await render(
      <PhotoCarousel images={[image("a"), image("b")]} />,
    );

    await fireEvent.press(getByTestId("photo-thumbnail-0"));
    await fireEvent.press(getByLabelText("Previous photo"));

    expect(getByText("2 / 2")).toBeTruthy();
  });

  it("offers no prev/next for a single photo", async () => {
    const { getByTestId, queryByLabelText } = await render(
      <PhotoCarousel images={[image("a")]} />,
    );

    await fireEvent.press(getByTestId("photo-thumbnail-0"));

    expect(queryByLabelText("Next photo")).toBeNull();
    expect(queryByLabelText("Previous photo")).toBeNull();
  });

  it("closes the viewer", async () => {
    const { getByTestId, getByLabelText, queryByLabelText } = await render(
      <PhotoCarousel images={[image("a")]} />,
    );

    await fireEvent.press(getByTestId("photo-thumbnail-0"));
    await fireEvent.press(getByLabelText("Close photo viewer"));

    expect(queryByLabelText("Close photo viewer")).toBeNull();
  });
});
