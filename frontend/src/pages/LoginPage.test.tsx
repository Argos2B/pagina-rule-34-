import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LoginPage } from "../pages/LoginPage";
import { useAuth } from "../auth/useAuth";

vi.mock("../auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  it("calls login with the entered credentials and redirects on success", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login,
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/usuario/i), "alice");
    await user.type(screen.getByLabelText(/contraseña/i), "S3curePassw0rd!");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(login).toHaveBeenCalledWith("alice", "S3curePassw0rd!");
    await waitFor(() => expect(screen.getByText("Home page")).toBeInTheDocument());
  });

  it("shows an error message when login fails", async () => {
    const login = vi.fn().mockRejectedValue(new Error("bad credentials"));
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login,
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/usuario/i), "alice");
    await user.type(screen.getByLabelText(/contraseña/i), "wrong");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo iniciar sesión.");
  });
});
