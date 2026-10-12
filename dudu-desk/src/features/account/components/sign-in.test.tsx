import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { SignIn } from "./sign-in";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSignIn(props: {
  pending?: boolean;
  error?: string;
  onSignIn: (credentials: {
    companyId: string;
    username: string;
    password: string;
  }) => Promise<boolean>;
}) {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }));
  return render(
    <ThemeProvider>
      <SignIn
        pending={props.pending ?? false}
        error={props.error}
        onSignIn={props.onSignIn}
      />
    </ThemeProvider>,
  );
}

describe("enterprise sign in form", () => {
  it("requires a six-digit company id before submitting the enterprise credentials", () => {
    const onSignIn = vi.fn(async () => true);
    renderSignIn({ onSignIn });

    const submit = screen.getByRole("button", { name: "登录" });
    fireEvent.change(screen.getByLabelText("企业 ID"), {
      target: { value: "12345" },
    });
    fireEvent.change(screen.getByLabelText("账号"), {
      target: { value: "boss" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    expect(submit).toBeDisabled();
    expect(onSignIn).not.toHaveBeenCalled();

    // 首位为 0 的补零写法不是合法的企业 ID
    fireEvent.change(screen.getByLabelText("企业 ID"), {
      target: { value: "078310" },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("企业 ID"), {
      target: { value: "783101" },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onSignIn).toHaveBeenCalledWith({
      companyId: "783101",
      username: "boss",
      password: "password123",
    });
  });

  it("keeps the contract input limits and shows the server refusal as the page error", () => {
    renderSignIn({ error: "无访问权限", onSignIn: async () => false });

    expect(screen.getByLabelText("企业 ID")).toHaveAttribute("maxlength", "6");
    expect(screen.getByLabelText("账号")).toHaveAttribute("maxlength", "64");
    expect(screen.getByLabelText("密码")).toHaveAttribute("maxlength", "72");
    expect(screen.getByRole("alert")).toHaveTextContent("无访问权限");
  });
});
