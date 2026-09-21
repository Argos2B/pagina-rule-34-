import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ProtectedRoute } from "../components/ProtectedRoute";
import { useAuth } from "../auth/useAuth";

vi.mock("../auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <div>Secret settings</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("shows a loading state while auth is bootstrapping", () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    renderProtected();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    renderProtected();
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders the protected content when authenticated", () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 1,
        username: "alice",
        email: "alice@example.com",
        avatar: null,
        biography: "",
        role: "user",
        is_email_verified: true,
        date_joined: "2024-01-01T00:00:00Z",
      },
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    renderProtected();
    expect(screen.getByText("Secret settings")).toBeInTheDocument();
  });
});
