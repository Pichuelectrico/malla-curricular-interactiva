import { useAuth } from "@clerk/clerk-react";
import backend from "~backend/client";
import { mockBackendClient, shouldUseRealBackend } from "./localBackend";

export function useBackend() {
  const { getToken, isSignedIn } = useAuth();
  
  // If no backend is configured, use the mock client
  if (!shouldUseRealBackend()) {
    return mockBackendClient;
  }
  
  // Use real backend with authentication
  if (!isSignedIn) return backend;
  return backend.with({
    auth: async () => {
      const token = await getToken();
      return { authorization: `Bearer ${token}` };
    },
  });
}
