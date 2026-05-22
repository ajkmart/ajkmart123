import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OtpInput } from "../src/components/OtpInput";

describe("OtpInput", () => {
  it("renders the correct number of input boxes (default 6)", () => {
    render(<OtpInput onComplete={vi.fn()} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(6);
  });

  it("renders custom number of inputs when length prop is provided", () => {
    render(<OtpInput onComplete={vi.fn()} length={4} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(4);
  });

  it("renders the label text", () => {
    render(<OtpInput onComplete={vi.fn()} label="Enter your code" />);
    expect(screen.getByText("Enter your code")).toBeInTheDocument();
  });

  it("accepts digit input and moves focus to next box", async () => {
    const user = userEvent.setup();
    render(<OtpInput onComplete={vi.fn()} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];

    await user.click(inputs[0]!);
    await user.keyboard("1");

    expect(inputs[0]!.value).toBe("1");
    expect(document.activeElement).toBe(inputs[1]);
  });

  it("ignores non-digit input", async () => {
    const user = userEvent.setup();
    render(<OtpInput onComplete={vi.fn()} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];

    await user.click(inputs[0]!);
    await user.keyboard("a");

    expect(inputs[0]!.value).toBe("");
  });

  it("calls onComplete when all digits are entered", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<OtpInput onComplete={onComplete} length={4} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];

    await user.click(inputs[0]!);
    await user.keyboard("1234");

    expect(onComplete).toHaveBeenCalledWith("1234");
  });

  it("handles backspace — clears current box", async () => {
    const user = userEvent.setup();
    render(<OtpInput onComplete={vi.fn()} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];

    await user.click(inputs[0]!);
    await user.keyboard("1");
    expect(inputs[0]!.value).toBe("1");

    await user.click(inputs[0]!);
    await user.keyboard("{Backspace}");
    expect(inputs[0]!.value).toBe("");
  });

  it("handles paste — fills all boxes from pasted string", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} length={6} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];

    const clipboardData = {
      getData: () => "123456",
    } as unknown as DataTransfer;

    fireEvent.paste(inputs[0]!, {
      clipboardData,
      preventDefault: vi.fn(),
    });

    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("handles paste — truncates to length if pasted text is longer", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} length={4} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];

    const clipboardData = {
      getData: () => "12345678",
    } as unknown as DataTransfer;

    fireEvent.paste(inputs[0]!, {
      clipboardData,
      preventDefault: vi.fn(),
    });

    expect(onComplete).toHaveBeenCalledWith("1234");
  });

  it("shows resend button when onResend prop is provided and cooldown expires", () => {
    vi.useFakeTimers();
    render(<OtpInput onComplete={vi.fn()} onResend={vi.fn()} resendCooldown={1} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("button", { name: /resend/i })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows cooldown timer when onResend is provided", () => {
    vi.useFakeTimers();
    render(<OtpInput onComplete={vi.fn()} onResend={vi.fn()} resendCooldown={60} />);

    expect(screen.getByText(/resend in/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("calls onResend and resets fields when resend button is clicked", async () => {
    const onResend = vi.fn();
    const user = userEvent.setup({ delay: null });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<OtpInput onComplete={vi.fn()} onResend={onResend} resendCooldown={1} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const btn = screen.getByRole("button", { name: /resend/i });
    await user.click(btn);

    expect(onResend).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("disables all inputs when disabled prop is true", () => {
    render(<OtpInput onComplete={vi.fn()} disabled />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });
  });
});
