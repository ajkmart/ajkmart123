import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  RegisterRole,
  StepComponentProps,
  StepConfig,
} from "../src/components/RegisterScreen";
import { RegisterScreen } from "../src/components/RegisterScreen";

const noop = () => {};

const basicSteps: StepConfig[] = [
  {
    id: "step1",
    title: "Step 1",
    subtitle: "First step",
    fields: [
      { id: "name", type: "text", label: "Full Name", required: true, placeholder: "Enter name" },
    ],
  },
  {
    id: "step2",
    title: "Step 2",
    subtitle: "Second step",
    fields: [{ id: "email", type: "email", label: "Email", required: true, placeholder: "Email" }],
  },
];

// 3-step form so the first step shows "Next →", not "Submit Registration"
const threeSteps: StepConfig[] = [
  {
    id: "step1",
    title: "Step 1",
    subtitle: "First step",
    fields: [
      { id: "name", type: "text", label: "Full Name", required: true, placeholder: "Enter name" },
    ],
  },
  {
    id: "step2",
    title: "Step 2",
    fields: [{ id: "city", type: "text", label: "City", placeholder: "Enter city" }],
  },
  {
    id: "step3",
    title: "Step 3",
    fields: [{ id: "email", type: "email", label: "Email", required: true, placeholder: "Email" }],
  },
];

const stepsWithPassword: StepConfig[] = [
  {
    id: "info",
    title: "Info",
    fields: [
      { id: "name", type: "text", label: "Name", placeholder: "Enter name", required: true },
    ],
  },
  {
    id: "password",
    title: "Password",
    fields: [
      { id: "password", type: "password", label: "Password", required: true },
      {
        id: "confirmPassword",
        type: "confirm-password",
        label: "Confirm Password",
        required: true,
      },
    ],
  },
];

const stepsWithOtp: StepConfig[] = [
  {
    id: "verify",
    title: "Verify Phone",
    fields: [
      { id: "phone", type: "phone", label: "Phone Number", required: true },
      { id: "otp", type: "otp", label: "OTP" },
    ],
  },
  {
    id: "info",
    title: "Info",
    fields: [{ id: "name", type: "text", label: "Name", required: true }],
  },
];

function renderScreen(role: RegisterRole, steps: StepConfig[], onComplete = noop) {
  return render(<RegisterScreen role={role} steps={steps} onComplete={onComplete} />);
}

describe("RegisterScreen", () => {
  it("renders the first step title and subtitle", () => {
    renderScreen("customer", basicSteps);
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    expect(screen.getByText("First step")).toBeInTheDocument();
  });

  it("renders first step fields", () => {
    renderScreen("customer", basicSteps);
    expect(screen.getByPlaceholderText("Enter name")).toBeInTheDocument();
  });

  it("renders the default title when none is provided", () => {
    renderScreen("rider", basicSteps);
    expect(screen.getByText("Rider Registration")).toBeInTheDocument();
  });

  it("renders custom title when provided", () => {
    render(
      <RegisterScreen role="customer" steps={basicSteps} onComplete={noop} title="Custom Title" />
    );
    expect(screen.getByText("Custom Title")).toBeInTheDocument();
  });

  it("shows progress dots for multi-step form", () => {
    const { container } = renderScreen("customer", basicSteps);
    const progressDots = container.querySelectorAll('[style*="border-radius: 4px"]');
    expect(progressDots.length).toBeGreaterThan(0);
  });

  it("shows validation error for required fields when advancing", async () => {
    // Use 3-step form so step 1 button says "Next →"
    renderScreen("customer", threeSteps);
    const nextBtn = screen.getByRole("button", { name: /next/i });
    await act(async () => {
      fireEvent.click(nextBtn);
    });
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });

  it("advances to next step when form is valid", async () => {
    renderScreen("customer", threeSteps);
    const input = screen.getByPlaceholderText("Enter name");
    await act(async () => {
      await userEvent.type(input, "Ali Khan");
    });
    const nextBtn = screen.getByRole("button", { name: /next/i });
    await act(async () => {
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expect(screen.getByText("Step 2")).toBeInTheDocument();
    });
  });

  it("shows back button on second step", async () => {
    renderScreen("customer", threeSteps);
    const input = screen.getByPlaceholderText("Enter name");
    await act(async () => {
      await userEvent.type(input, "Ali Khan");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
    });
  });

  it("goes back when back button is clicked", async () => {
    renderScreen("customer", threeSteps);
    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText("Enter name"), "Ali Khan");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
    });
    await waitFor(() => screen.getByText("Step 2"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /back/i }));
    });
    await waitFor(() => {
      expect(screen.getByText("First step")).toBeInTheDocument();
    });
  });

  it("calls onComplete with accumulated form data on last step", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderScreen("customer", basicSteps, onComplete);

    await user.type(screen.getByPlaceholderText("Enter name"), "Ali Khan");
    // Step 1 of a 2-step form shows "Submit Registration"
    await user.click(screen.getByRole("button", { name: /submit registration/i }));
    await waitFor(() => screen.getByText("Step 2"));
    await user.type(screen.getByPlaceholderText("Email"), "ali@test.com");
    await user.click(screen.getByRole("button", { name: /go to login/i }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Ali Khan", email: "ali@test.com" })
      );
    });
  });

  it("shows confirm-password mismatch error", async () => {
    const { container } = renderScreen("customer", stepsWithPassword);
    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText("Enter name"), "Test");
    });
    // First step of 2 shows "Submit Registration"
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit registration/i }));
    });
    await waitFor(() => screen.getByText("Confirm Password"));
    const [pw1, pw2] = Array.from(
      container.querySelectorAll('input[type="password"]')
    ) as HTMLInputElement[];
    await act(async () => {
      await userEvent.type(pw1, "password123");
    });
    await act(async () => {
      await userEvent.type(pw2, "different");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /go to login/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it("detects OTP step and shows Send Code button", () => {
    global.fetch = vi.fn();
    renderScreen("customer", stepsWithOtp);
    expect(screen.getByRole("button", { name: /send verification code/i })).toBeInTheDocument();
  });

  it("shows custom step component when provided", () => {
    const CustomComp = ({
      data: _d,
      onChange: _c,
      onError: _e,
      onNext: _n,
      role: _r,
    }: StepComponentProps) => <div data-testid="custom-step">Custom Step Content</div>;
    const stepsWithCustom: StepConfig[] = [
      { id: "custom", title: "Custom", fields: [], component: CustomComp },
    ];
    renderScreen("vendor", stepsWithCustom, vi.fn());
    expect(screen.getByTestId("custom-step")).toBeInTheDocument();
    expect(screen.getByText("Custom Step Content")).toBeInTheDocument();
  });

  it("shows vendor accent color in title area for vendor role", () => {
    const { container } = renderScreen("vendor", basicSteps);
    const btn = container.querySelector('button[style*="background"]');
    expect(btn).toBeTruthy();
  });

  it("renders select field with options", () => {
    const stepsWithSelect: StepConfig[] = [
      {
        id: "select",
        title: "Select Test",
        fields: [
          {
            id: "city",
            type: "select",
            label: "City",
            options: [
              { value: "mzd", label: "Muzaffarabad" },
              { value: "mrp", label: "Mirpur" },
            ],
          },
        ],
      },
    ];
    renderScreen("customer", stepsWithSelect, vi.fn());
    expect(screen.getByText("Muzaffarabad")).toBeInTheDocument();
    expect(screen.getByText("Mirpur")).toBeInTheDocument();
  });

  it("renders checkbox field", () => {
    const stepsWithCheckbox: StepConfig[] = [
      {
        id: "terms",
        title: "Terms",
        fields: [{ id: "accepted", type: "checkbox", label: "Accept Terms" }],
      },
    ];
    renderScreen("customer", stepsWithCheckbox, vi.fn());
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByText("Accept Terms")).toBeInTheDocument();
  });

  it("calls custom field validator and shows error", async () => {
    const stepsWithCustomValidation: StepConfig[] = [
      {
        id: "age",
        title: "Age Check",
        fields: [
          {
            id: "age",
            type: "text",
            label: "Age",
            required: true,
            validate: (v) => (!v || Number(v) < 18 ? "Must be 18 or older" : null),
          },
        ],
      },
    ];
    renderScreen("customer", stepsWithCustomValidation, vi.fn());
    await act(async () => {
      await userEvent.type(screen.getByRole("textbox"), "15");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /go to login/i }));
    });
    await waitFor(() => {
      expect(screen.getByText("Must be 18 or older")).toBeInTheDocument();
    });
  });

  it("re-syncs form data when initialData reference changes", async () => {
    const { rerender } = render(
      <RegisterScreen role="customer" steps={basicSteps} initialData={{ name: "Original" }} />
    );
    expect((screen.getByPlaceholderText("Enter name") as HTMLInputElement).value).toBe("Original");

    rerender(
      <RegisterScreen role="customer" steps={basicSteps} initialData={{ name: "Updated" }} />
    );

    await waitFor(() => {
      expect((screen.getByPlaceholderText("Enter name") as HTMLInputElement).value).toBe("Updated");
    });
  });
});
