import { useReducer } from "react";
import type { Provider, ProviderType } from "../types/config";

const DEFAULT_CLI_ARGS = ["-p"];

export interface ProviderFormState {
  name: string;
  type: ProviderType;
  endpoint: string;
  apiKey: string;
  defaultModel: string;
  command: string;
  args: string[];
  headers: [string, string][];
}

type ProviderFormAction =
  | {
      type: "field";
      field: keyof Omit<ProviderFormState, "args" | "headers">;
      value: string;
    }
  | { type: "setType"; value: ProviderType; defaultArgs: boolean }
  | { type: "addArg" }
  | { type: "setArg"; index: number; value: string }
  | { type: "removeArg"; index: number }
  | { type: "addHeader" }
  | { type: "setHeaderKey"; index: number; value: string }
  | { type: "setHeaderValue"; index: number; value: string }
  | { type: "removeHeader"; index: number }
  | { type: "reset"; value: ProviderFormState };

export function getInitialProviderFormState(
  initial?: Provider,
): ProviderFormState {
  return {
    name: initial?.name ?? "",
    type: initial?.type ?? "anthropic",
    endpoint: initial?.endpoint ?? "",
    apiKey: initial?.apiKey ?? "",
    defaultModel: initial?.defaultModel ?? "",
    command: initial?.command ?? "",
    args: initial?.type === "cli" ? (initial.args ?? []) : [],
    headers: Object.entries(initial?.headers ?? {}),
  };
}

function providerFormReducer(
  state: ProviderFormState,
  action: ProviderFormAction,
): ProviderFormState {
  switch (action.type) {
    case "field":
      return { ...state, [action.field]: action.value };
    case "setType":
      return {
        ...state,
        type: action.value,
        args: action.defaultArgs ? DEFAULT_CLI_ARGS : state.args,
      };
    case "addArg":
      return { ...state, args: [...state.args, ""] };
    case "setArg":
      return {
        ...state,
        args: state.args.map((item, index) =>
          index === action.index ? action.value : item,
        ),
      };
    case "removeArg":
      return {
        ...state,
        args: state.args.filter((_, index) => index !== action.index),
      };
    case "addHeader":
      return { ...state, headers: [...state.headers, ["", ""]] };
    case "setHeaderKey":
      return {
        ...state,
        headers: state.headers.map((item, index) =>
          index === action.index ? [action.value, item[1]] : item,
        ),
      };
    case "setHeaderValue":
      return {
        ...state,
        headers: state.headers.map((item, index) =>
          index === action.index ? [item[0], action.value] : item,
        ),
      };
    case "removeHeader":
      return {
        ...state,
        headers: state.headers.filter((_, index) => index !== action.index),
      };
    case "reset":
      return action.value;
  }
}

export default function useProviderFormState(initial?: Provider) {
  return useReducer(providerFormReducer, initial, getInitialProviderFormState);
}
