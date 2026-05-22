import "@testing-library/jest-dom";
import { act } from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof (globalThis as Record<string, unknown>).React === "undefined") {
  (globalThis as Record<string, unknown>).React = { act };
}
