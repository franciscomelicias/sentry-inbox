import { describe, expect, it } from "vitest";
import { parseBlameAuthor, repoPathFor } from "./blame";

describe("parseBlameAuthor", () => {
  it("reads the author line of git blame --porcelain", () => {
    const porcelain = ["4f1c2a9 2019 2019 1", "author Luca", "author-mail <luca@example.com>", "\tthrow new ValidationException();"].join("\n");
    expect(parseBlameAuthor(porcelain)).toBe("Luca");
  });

  it("returns null for uncommitted lines", () => {
    expect(parseBlameAuthor("0000000 1 1 1\nauthor Not Committed Yet\n")).toBeNull();
  });
});

describe("repoPathFor", () => {
  const files = [
    "roger-customer-service/src/main/java/com/rogerhr/customer/domain/leave_request/LeaveRequestService.java",
    "roger-frontend/src/page/leave/LeaveRequestDialog.tsx",
  ];

  it("finds the repo file whose path ends with the frame path", () => {
    expect(repoPathFor("com/rogerhr/customer/domain/leave_request/LeaveRequestService.java", files)).toBe(files[0]);
    expect(repoPathFor("src/page/leave/LeaveRequestDialog.tsx", files)).toBe(files[1]);
  });

  it("returns null when nothing matches", () => {
    expect(repoPathFor("src/nope.ts", files)).toBeNull();
  });
});
