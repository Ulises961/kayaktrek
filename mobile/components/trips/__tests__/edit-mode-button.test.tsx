import { fireEvent, render } from "@testing-library/react-native";

import { EditModeButton } from "../edit-mode-button";

describe("EditModeButton", () => {
  it("offers Edit while viewing, and asks to switch to edit mode when pressed", async () => {
    const onToggle = jest.fn();
    const { getByText, queryByText, getByTestId } = await render(
      <EditModeButton editing={false} onToggle={onToggle} />,
    );

    expect(getByText("Edit")).toBeTruthy();
    expect(queryByText("Done")).toBeNull();
    await fireEvent.press(getByTestId("edit-mode-toggle"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("offers Done while editing, and asks to go back to view mode when pressed", async () => {
    const onToggle = jest.fn();
    const { getByText, queryByText, getByTestId } = await render(
      <EditModeButton editing onToggle={onToggle} />,
    );

    expect(getByText("Done")).toBeTruthy();
    expect(queryByText("Edit")).toBeNull();
    await fireEvent.press(getByTestId("edit-mode-toggle"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
