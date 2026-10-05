
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import type { UserProfile } from "../services/api/userApi";
import { userApi } from "../services/api/userApi";
import { getApiErrorMessage } from "../services/api/client";
import { resolveMediaUrl } from "../config/api";
import FeedbackModal, { type FeedbackType } from "./FeedbackModal";
import {
  CARD,
  TEXT,
  TEXT_MUTED,
  BORDER,
  PRIMARY,
  TAG_BG,
  SUCCESS,
} from "../theme/colors";

type Props = {
  profile: UserProfile | null;
  onUpdated: (profile: UserProfile) => void;
};

export default function ProfileSection({ profile, onUpdated }: Props) {
  const [uploading, setUploading] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
  });

  const show = (
    type: FeedbackType,
    title: string,
    message: string
  ) => {
    setPopup({
      visible: true,
      type,
      title,
      message,
    });
  };

  const pickPhoto = async () => {
    const perm =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!perm.granted) {
      show(
        "error",
        "Permission needed",
        "Allow photo access to set your profile picture."
      );
      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.75,
      });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    setUploading(true);

    try {
      const asset = result.assets[0];

      const formData = new FormData();

      formData.append("profile_photo", {
        uri: asset.uri,
        name: asset.fileName ?? "profile.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as any);

      const updated = await userApi.uploadPhoto(formData);

      onUpdated(updated);

      show(
        "success",
        "Photo updated",
        "Your profile photo was saved."
      );
    } catch (err) {
      show(
        "error",
        "Upload failed",
        getApiErrorMessage(
          err,
          "Could not upload photo."
        )
      );
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    setUploading(true);

    try {
      const updated = await userApi.deletePhoto();

      onUpdated(updated);

      show(
        "success",
        "Photo removed",
        "Your profile photo was deleted."
      );
    } catch (err) {
      show(
        "error",
        "Failed",
        getApiErrorMessage(
          err,
          "Could not remove photo."
        )
      );
    } finally {
      setUploading(false);
    }
  };

  const submitPassword = async () => {
    if (!currentPw || !newPw) {
      show(
        "error",
        "Missing fields",
        "Enter current and new password."
      );
      return;
    }

    if (newPw.length < 8) {
      show(
        "error",
        "Too short",
        "New password must be at least 8 characters."
      );
      return;
    }

    if (newPw !== confirmPw) {
      show(
        "error",
        "Mismatch",
        "New passwords do not match."
      );
      return;
    }

    setChangingPw(true);

    try {
      await userApi.changePassword(
        currentPw,
        newPw
      );

      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setShowPwForm(false);

      show(
        "success",
        "Password changed",
        "Your password was updated."
      );
    } catch (err) {
      show(
        "error",
        "Failed",
        getApiErrorMessage(
          err,
          "Could not change password."
        )
      );
    } finally {
      setChangingPw(false);
    }
  };

  if (!profile) {
    return null;
  }

  const normalizedRole =
    profile.role?.toUpperCase();

  const roleLabel =
    normalizedRole === "FREELANCER"
      ? "Service Provider"
      : normalizedRole === "ADMIN"
        ? "Administrator"
        : "Customer";

  const isProvider =
    normalizedRole === "FREELANCER";

  const kycLabel = profile.kyc_status
    ? profile.kyc_status.charAt(0).toUpperCase() +
      profile.kyc_status.slice(1)
    : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.photoRow}>
        {profile.profile_photo ? (
          <Image
            source={{
              uri: resolveMediaUrl(
                profile.profile_photo
              ),
            }}
            style={styles.avatar}
            key={profile.profile_photo}
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetter}>
              {profile.username
                .charAt(0)
                .toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.photoActions}>
          <TouchableOpacity
            style={styles.smallBtn}
            onPress={pickPhoto}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator
                color={PRIMARY}
                size="small"
              />
            ) : (
              <Text style={styles.smallBtnText}>
                {profile.profile_photo
                  ? "Change photo"
                  : "Upload photo"}
              </Text>
            )}
          </TouchableOpacity>

          {profile.profile_photo ? (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={removePhoto}
              disabled={uploading}
            >
              <Text style={styles.deleteText}>
                Delete photo
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <InfoRow
        label="Username"
        value={profile.username}
      />

      <InfoRow
        label="Email"
        value={profile.email}
      />

      <InfoRow
        label="Role"
        value={roleLabel}
      />

      {isProvider && kycLabel ? (
        <InfoRow
          label="KYC status"
          value={
            kycLabel +
            (profile.is_verified ? " ✓" : "")
          }
          highlight={
            profile.kyc_status?.toUpperCase() === "APPROVED"
              ? "approved"
              : profile.kyc_status?.toUpperCase() === "REJECTED"
                ? "rejected"
                : undefined
          }
        />
      ) : null}

      <TouchableOpacity
        style={styles.pwToggle}
        onPress={() =>
          setShowPwForm((v) => !v)
        }
      >
        <Text style={styles.pwToggleText}>
          {showPwForm
            ? "Hide change password"
            : "Change password"}
        </Text>
      </TouchableOpacity>

      {showPwForm ? (
        <View style={styles.pwForm}>
          <TextInput
            placeholder="Current password"
            secureTextEntry
            value={currentPw}
            onChangeText={setCurrentPw}
            style={styles.input}
          />

          <TextInput
            placeholder="New password"
            secureTextEntry
            value={newPw}
            onChangeText={setNewPw}
            style={styles.input}
          />

          <TextInput
            placeholder="Confirm new password"
            secureTextEntry
            value={confirmPw}
            onChangeText={setConfirmPw}
            style={styles.input}
          />

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={submitPassword}
            disabled={changingPw}
          >
            {changingPw ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>
                Save new password
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={() =>
          setPopup((p) => ({
            ...p,
            visible: false,
          }))
        }
      />
    </View>
  );
}

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "approved" | "rejected";
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>
        {label}
      </Text>

      <Text
        style={[
          styles.infoValue,
          highlight === "approved" && {
            color: SUCCESS,
          },
          highlight === "rejected" && {
            color: "#DC2626",
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 24,
  },

  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },

  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarLetter: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },

  photoActions: {
    marginLeft: 16,
    flex: 1,
    gap: 8,
  },

  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PRIMARY,
    alignSelf: "flex-start",
  },

  smallBtnText: {
    color: PRIMARY,
    fontWeight: "700",
    fontSize: 13,
  },

  deleteBtn: {
    alignSelf: "flex-start",
  },

  deleteText: {
    color: "#DC2626",
    fontWeight: "600",
    fontSize: 13,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  infoLabel: {
    color: TEXT_MUTED,
    fontSize: 14,
  },

  infoValue: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 14,
    maxWidth: "58%",
    textAlign: "right",
  },

  pwToggle: {
    marginTop: 14,
  },

  pwToggleText: {
    color: PRIMARY,
    fontWeight: "700",
  },

  pwForm: {
    marginTop: 12,
  },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: TAG_BG,
    color: TEXT,
  },

  saveBtn: {
    backgroundColor: PRIMARY,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },

  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
});

