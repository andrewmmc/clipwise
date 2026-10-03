import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import useProviderFormState, {
  getInitialProviderFormState,
} from "./useProviderFormState";
import type { Provider } from "../types/config";

describe("getInitialProviderFormState", () => {
  it("returns empty defaults with no initial provider", () => {
    const state = getInitialProviderFormState();
    expect(state).toMatchObject({
      name: "",
      type: "anthropic",
      endpoint: "",
      apiKey: "",
      defaultModel: "",
      command: "",
      args: [],
      headers: [],
    });
  });

  it("hydrates from a CLI provider including args and headers", () => {
    const provider = {
      id: "p1",
      name: "My CLI",
      type: "cli",
      command: "llm",
      args: ["-p", "hello"],
      headers: { "X-Token": "abc" },
    } as Provider;

    const state = getInitialProviderFormState(provider);
    expect(state.args).toEqual(["-p", "hello"]);
    expect(state.headers).toEqual([["X-Token", "abc"]]);
    expect(state.command).toBe("llm");
  });

  it("ignores args for non-CLI providers", () => {
    const provider = {
      id: "p1",
      name: "OpenAI",
      type: "openai",
      args: ["-p"],
      headers: {},
    } as Provider;

    expect(getInitialProviderFormState(provider).args).toEqual([]);
  });
});

describe("useProviderFormState reducer", () => {
  it("updates a single field", () => {
    const { result } = renderHook(() => useProviderFormState());
    act(() => result.current[1]({ type: "field", field: "name", value: "X" }));
    expect(result.current[0].name).toBe("X");
  });

  it("sets the CLI type with default args", () => {
    const { result } = renderHook(() => useProviderFormState());
    act(() =>
      result.current[1]({ type: "setType", value: "cli", defaultArgs: true }),
    );
    expect(result.current[0].type).toBe("cli");
    expect(result.current[0].args).toEqual(["-p"]);
  });

  it("keeps existing args when defaultArgs is false", () => {
    const { result } = renderHook(() => useProviderFormState());
    act(() => result.current[1]({ type: "addArg" }));
    act(() => result.current[1]({ type: "setArg", index: 0, value: "keep" }));
    act(() =>
      result.current[1]({ type: "setType", value: "cli", defaultArgs: false }),
    );
    expect(result.current[0].args).toEqual(["keep"]);
  });

  it("adds, edits, and removes args, leaving other args untouched", () => {
    const { result } = renderHook(() => useProviderFormState());
    act(() => result.current[1]({ type: "addArg" }));
    act(() => result.current[1]({ type: "addArg" }));
    act(() => result.current[1]({ type: "setArg", index: 1, value: "second" }));
    // Index 0 is unchanged (exercises the false branch of the map).
    expect(result.current[0].args).toEqual(["", "second"]);

    act(() => result.current[1]({ type: "removeArg", index: 0 }));
    expect(result.current[0].args).toEqual(["second"]);
  });

  it("adds, edits keys/values, and removes headers, leaving others untouched", () => {
    const { result } = renderHook(() => useProviderFormState());
    act(() => result.current[1]({ type: "addHeader" }));
    act(() => result.current[1]({ type: "addHeader" }));
    act(() =>
      result.current[1]({ type: "setHeaderKey", index: 1, value: "K2" }),
    );
    act(() =>
      result.current[1]({ type: "setHeaderValue", index: 1, value: "V2" }),
    );
    // Header 0 stays empty (exercises the false branch of both maps).
    expect(result.current[0].headers).toEqual([
      ["", ""],
      ["K2", "V2"],
    ]);

    act(() => result.current[1]({ type: "removeHeader", index: 0 }));
    expect(result.current[0].headers).toEqual([["K2", "V2"]]);
  });

  it("resets to a provided state", () => {
    const { result } = renderHook(() => useProviderFormState());
    const next = getInitialProviderFormState();
    next.name = "Reset";
    act(() => result.current[1]({ type: "reset", value: next }));
    expect(result.current[0].name).toBe("Reset");
  });
});
