import { describe, expect, it } from "vitest";
import { checkGrounding, findGroundingToolCalls } from "../src/grounding.js";
import type { DetectedClaim, ToolCallRecord } from "../src/types.js";

const timeClaim: DetectedClaim = { kind: "external_state", text: "it is late", category: "time", index: 0 };
const roleClaim: DetectedClaim = { kind: "external_state", text: "the current president is X", category: "current_role", index: 0 };

describe("checkGrounding", () => {
  it("grounds a time claim when a matching time tool call is present", () => {
    const toolCalls: ToolCallRecord[] = [{ name: "get_time" }];
    expect(checkGrounding(timeClaim, toolCalls)).toBe("grounded");
  });

  it("leaves a time claim ungrounded with no tool calls", () => {
    expect(checkGrounding(timeClaim, [])).toBe("ungrounded");
  });

  it("leaves a time claim ungrounded when only unrelated tool calls occurred", () => {
    const toolCalls: ToolCallRecord[] = [{ name: "read_file" }];
    expect(checkGrounding(timeClaim, toolCalls)).toBe("ungrounded");
  });

  it("grounds a current-role claim with a search tool call", () => {
    const toolCalls: ToolCallRecord[] = [{ name: "web_search" }];
    expect(checkGrounding(roleClaim, toolCalls)).toBe("grounded");
  });

  it("supports a custom tool-name mapping override", () => {
    const toolCalls: ToolCallRecord[] = [{ name: "acme_internal_chronograph" }];
    expect(checkGrounding(timeClaim, toolCalls)).toBe("ungrounded");
    const customPatterns = { time: /acme_internal_chronograph/i };
    expect(checkGrounding(timeClaim, toolCalls, customPatterns)).toBe("grounded");
  });

  it("findGroundingToolCalls returns the matched tool calls", () => {
    const toolCalls: ToolCallRecord[] = [{ name: "get_time", id: "call_1" }, { name: "read_file", id: "call_2" }];
    const matched = findGroundingToolCalls(timeClaim, toolCalls);
    expect(matched).toEqual([{ name: "get_time", id: "call_1" }]);
  });

  it("returns no grounding tool calls for a claim without a category", () => {
    const claim: DetectedClaim = { kind: "external_state", text: "something", index: 0 };
    expect(findGroundingToolCalls(claim, [{ name: "get_time" }])).toEqual([]);
  });

  it("returns no grounding tool calls when the category has no pattern in the map", () => {
    const claim: DetectedClaim = { kind: "external_state", text: "something", category: "unmapped_category", index: 0 };
    expect(findGroundingToolCalls(claim, [{ name: "get_time" }])).toEqual([]);
    expect(checkGrounding(claim, [{ name: "get_time" }])).toBe("ungrounded");
  });
});
