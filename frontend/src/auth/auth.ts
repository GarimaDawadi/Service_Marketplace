import { StorageKeys, getItem, removeItems, setItem } from "../utils/storage";

export type AuthData = {
  access: string;
  refresh?: string;
  role: string;
  username: string;
  email?: string;
};

export const setAuth = async (data: AuthData) => {
  await Promise.all([
    setItem(StorageKeys.TOKEN, data.access),
    data.refresh ? setItem(StorageKeys.REFRESH_TOKEN, data.refresh) : Promise.resolve(),
    setItem(StorageKeys.ROLE, data.role),
    setItem(StorageKeys.USERNAME, data.username),
    data.email ? setItem(StorageKeys.EMAIL, data.email) : Promise.resolve(),
  ]);
};

export const getAuth = async () => {
  const [token, refreshToken, role, username, email] = await Promise.all([
    getItem(StorageKeys.TOKEN),
    getItem(StorageKeys.REFRESH_TOKEN),
    getItem(StorageKeys.ROLE),
    getItem(StorageKeys.USERNAME),
    getItem(StorageKeys.EMAIL),
  ]);
  return { token, refreshToken, role, username, email };
};

export const logout = async () => {
  await removeItems([
    StorageKeys.TOKEN,
    StorageKeys.REFRESH_TOKEN,
    StorageKeys.ROLE,
    StorageKeys.USERNAME,
    StorageKeys.EMAIL,
    StorageKeys.PROFILE_COMPLETED,
    StorageKeys.KYC_STATUS,
    StorageKeys.SERVICES,
  ]);
};

export { getPostLoginRoute, resolveInitialRoute } from "../navigation/workflow";
export { Routes } from "../navigation/routes";
