import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PostCard } from "../components/PostCard";
import type { Post } from "../types/api";

const basePost: Post = {
  id: 1,
  title: "Un atardecer",
  description: "",
  image: "https://example.com/image.jpg",
  author: 5,
  author_username: "alice",
  category: null,
  category_name: null,
  tags: ["paisaje", "digital"],
  status: "published",
  visibility: "public",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

function renderWithRouter(post: Post) {
  return render(
    <MemoryRouter>
      <PostCard post={post} />
    </MemoryRouter>,
  );
}

describe("PostCard", () => {
  it("renders the title, author and tags", () => {
    renderWithRouter(basePost);
    expect(screen.getByText("Un atardecer")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /paisaje/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /digital/i })).toBeInTheDocument();
  });

  it("shows an 'unlisted' badge only for unlisted posts", () => {
    renderWithRouter({ ...basePost, visibility: "unlisted" });
    expect(screen.getByText("No listado")).toBeInTheDocument();
  });

  it("does not show the badge for public posts", () => {
    renderWithRouter(basePost);
    expect(screen.queryByText("No listado")).not.toBeInTheDocument();
  });
});
