export interface ActionPreset {
  label: string;
  name: string;
  userPrompt: string;
}

export const ACTION_PRESETS: ActionPreset[] = [
  {
    label: "Improve writing",
    name: "Improve writing",
    userPrompt:
      "Improve the writing quality, clarity, and flow of the following text.",
  },
  {
    label: "Make concise",
    name: "Make concise",
    userPrompt:
      "Make the following text more concise without losing important meaning.",
  },
  {
    label: "Summarize",
    name: "Summarize",
    userPrompt: "Summarize the following text clearly and briefly.",
  },
  {
    label: "Translate to English",
    name: "Translate to English",
    userPrompt: "Translate the following text to English.",
  },
  {
    label: "Fix grammar",
    name: "Fix grammar",
    userPrompt: "Fix grammar, spelling, and punctuation in the following text.",
  },
];
