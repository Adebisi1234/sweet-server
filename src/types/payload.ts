export type hmrPayload = {
  event: "change";
  path: string;
  timestamp: number;
  type: "style:update" | "js:update" | "reload" | "warning" | "error";
};
