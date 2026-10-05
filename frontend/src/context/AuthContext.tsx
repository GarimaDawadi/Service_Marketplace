import React, { createContext, useState, useEffect, ReactNode } from "react";
import { getItem, removeItems, setItem, StorageKeys } from "../utils/storage";

type AuthContextType = {
  userToken: string | null;
  login: (token: string, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

type Props = { children: ReactNode };

const AuthProvider = ({ children }: Props) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const login = async (token: string, refreshToken?: string) => {
    await setItem(StorageKeys.TOKEN, token);
    if (refreshToken) await setItem(StorageKeys.REFRESH_TOKEN, refreshToken);
    setUserToken(token);
  };

  const logout = async () => {
    await removeItems([StorageKeys.TOKEN, StorageKeys.REFRESH_TOKEN]);
    setUserToken(null);
  };

  useEffect(() => {
    getItem(StorageKeys.TOKEN).then(setUserToken).finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ userToken, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
