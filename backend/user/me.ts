import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";

export interface UserInfo {
  id: string;
  email: string | null;
  imageUrl: string;
}

export const getUserInfo = api<void, UserInfo>(
  { auth: true, expose: true, method: "GET", path: "/user/me" },
  async () => {
    const auth = getAuthData()!;
    return {
      id: auth.userID,
      email: auth.email,
      imageUrl: auth.imageUrl,
    };
  }
);
