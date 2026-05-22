import { customFetch } from "./custom-fetch";

export const rateRide = async (
  id: string,
  body: { stars: number; comment?: string },
  options?: RequestInit
): Promise<any> => {
  return customFetch(`/rides/${id}/rate`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  });
};

export const getDispatchStatus = async (id: string, options?: RequestInit): Promise<any> => {
  return customFetch(`/rides/${id}/dispatch-status`, {
    ...options,
    method: "GET",
  });
};

export const retryRideDispatch = async (id: string, options?: RequestInit): Promise<any> => {
  return customFetch(`/rides/${id}/retry`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: "{}",
  });
};
