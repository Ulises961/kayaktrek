import { act, fireEvent, render } from "@testing-library/react-native";

import { UndoSnackbar } from "../undo-snackbar";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("UndoSnackbar", () => {
  it("shows the message and calls onUndo, not onDismiss, when Undo is pressed", async () => {
    const onUndo = jest.fn();
    const onDismiss = jest.fn();
    const { getByText, getByLabelText } = await render(
      <UndoSnackbar message="Point moved" onUndo={onUndo} onDismiss={onDismiss} />,
    );

    expect(getByText("Point moved")).toBeTruthy();
    await fireEvent.press(getByLabelText("Undo move"));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses itself once the window has passed, and not before", async () => {
    const onDismiss = jest.fn();
    await render(
      <UndoSnackbar message="Point moved" onUndo={jest.fn()} onDismiss={onDismiss} durationMs={6000} />,
    );

    await act(async () => jest.advanceTimersByTime(5999));
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("restarts the window when the message changes, so a second move is not cut short", async () => {
    const onDismiss = jest.fn();
    const onUndo = jest.fn();
    const { rerender } = await render(
      <UndoSnackbar message="Point moved" onUndo={onUndo} onDismiss={onDismiss} durationMs={6000} />,
    );

    await act(async () => jest.advanceTimersByTime(4000));
    await rerender(
      <UndoSnackbar message="Point moved again" onUndo={onUndo} onDismiss={onDismiss} durationMs={6000} />,
    );
    await act(async () => jest.advanceTimersByTime(4000));
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(2000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not fire onDismiss after unmounting", async () => {
    const onDismiss = jest.fn();
    const { unmount } = await render(
      <UndoSnackbar message="Point moved" onUndo={jest.fn()} onDismiss={onDismiss} />,
    );

    await unmount();
    await act(async () => jest.advanceTimersByTime(10000));

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
