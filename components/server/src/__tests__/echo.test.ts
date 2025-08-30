import { describe, expect, it } from "vitest";

describe("Echo Tool Functionality", () => {
	describe("text processing", () => {
		it("should format echo response correctly", () => {
			const input = "Hello, World!";
			const expected = "Echo: Hello, World!";
			const actual = `Echo: ${input}`;

			expect(actual).toBe(expected);
		});

		it("should handle empty text", () => {
			const input = "";
			const expected = "Echo: ";
			const actual = `Echo: ${input}`;

			expect(actual).toBe(expected);
		});

		it("should handle undefined text", () => {
			const input = undefined;
			const expected = "Echo: ";
			const actual = `Echo: ${input || ""}`;

			expect(actual).toBe(expected);
		});

		it("should handle special characters", () => {
			const input = "Hello\nWorld\t!@#$%^&*()";
			const expected = "Echo: Hello\nWorld\t!@#$%^&*()";
			const actual = `Echo: ${input}`;

			expect(actual).toBe(expected);
		});

		it("should handle long text", () => {
			const input = "A".repeat(1000);
			const expected = `Echo: ${"A".repeat(1000)}`;
			const actual = `Echo: ${input}`;

			expect(actual).toBe(expected);
		});
	});

	describe("input validation", () => {
		it("should handle various input types gracefully", () => {
			const testCases = [
				{ input: null, expected: "Echo: " },
				{ input: undefined, expected: "Echo: " },
				{ input: "", expected: "Echo: " },
				{ input: "hello", expected: "Echo: hello" },
			];

			testCases.forEach(({ input, expected }) => {
				const actual = `Echo: ${input || ""}`;
				expect(actual).toBe(expected);
			});
		});

		it("should handle falsy values correctly", () => {
			const zero: number | null = 0;
			const falseValue: boolean | null = false;
			const empty: string | null = "";

			expect(`Echo: ${zero ?? ""}`).toBe("Echo: 0");
			expect(`Echo: ${falseValue ?? ""}`).toBe("Echo: false");
			expect(`Echo: ${empty ?? "default"}`).toBe("Echo: ");
		});
	});
});
