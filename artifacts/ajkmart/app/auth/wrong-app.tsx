import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useAuth, hasRole } from "@/context/AuthContext";
import { API_BASE } from "@/utils/api";
import { useTheme } from "@/context/ThemeContext";

export default function WrongAppScreen() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { user, token, logout, updateUser } = useAuth();
  const [addingRole, setAddingRole] = useState(false);
  const [addRoleError, setAddRoleError] = useState<string | null>(null);

  const primaryRole = (user?.roles ?? [])[0];
  const roleLabel =
    primaryRole === "rider"
      ? "Delivery Rider"
      : primaryRole === "vendor"
        ? "Store Vendor"
        : "non-customer";

  const canAddCustomerRole = user && !hasRole(user, "customer");

  const handleSignOut = async () => {
    await logout();
    router.replace("/auth");
  };

  const handleAddCustomerRole = async () => {
    if (!token) return;
    setAddingRole(true);
    setAddRoleError(null);
    try {
      const res = await fetch(`${API_BASE}/users/add-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: "customer" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddRoleError(
          data.error || "Failed to add customer access. Please try again.",
        );
        return;
      }
      updateUser({ roles: data.data?.roles ?? data.roles ?? [] });
      router.replace("/(tabs)");
    } catch {
      setAddRoleError(
        "Network error. Please check your connection and try again.",
      );
    } finally {
      setAddingRole(false);
    }
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="alert-circle" size={56} color={C.amber} />
      </View>

      <Text style={styles.title}>Wrong App</Text>

      <Text style={styles.subtitle}>
        {`You signed in as a ${roleLabel} account. This is the AJKMart customer app — it is designed for customers to browse, order, and track deliveries.`}
      </Text>

      <Text style={styles.hint}>
        {hasRole(user, "rider")
          ? "Please use the AJKMart Rider App to manage your deliveries."
          : hasRole(user, "vendor")
            ? "Please use the AJKMart Vendor App to manage your store."
            : "Please sign in with a customer account to continue."}
      </Text>

      {canAddCustomerRole && (
        <>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.addRoleBtn}
            onPress={handleAddCustomerRole}
            disabled={addingRole}
            accessibilityRole="button"
          >
            {addingRole ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.addRoleTxt}>Add Customer Access</Text>
              </>
            )}
          </TouchableOpacity>
          {addRoleError && <Text style={styles.errorTxt}>{addRoleError}</Text>}
          <Text style={styles.addRoleHint}>
            This will add customer access to your existing account — you can
            still use the Rider/Vendor app.
          </Text>
        </>
      )}

      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.signOutBtn}
        onPress={handleSignOut}
        accessibilityRole="button"
      >
        <Ionicons name="log-out-outline" size={18} color="#fff" />
        <Text style={styles.signOutTxt}>Sign Out</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.backBtn}
        onPress={async () => {
          await logout();
          router.replace("/auth");
        }}
        accessibilityRole="button"
      >
        <Text style={styles.backTxt}>Use a Different Account</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: C.amberSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  title: {
    fontFamily: Font.bold,
    fontSize: 26,
    color: C.text,
    textAlign: "center",
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: Font.regular,
    fontSize: 15,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 12,
  },
  hint: {
    fontFamily: Font.semiBold,
    fontSize: 14,
    color: C.amber,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  addRoleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.success,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 36,
    width: "100%",
    justifyContent: "center",
    marginBottom: 8,
  },
  addRoleTxt: {
    fontFamily: Font.bold,
    fontSize: 15,
    color: "#fff",
  },
  addRoleHint: {
    fontFamily: Font.regular,
    fontSize: 12,
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  errorTxt: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: C.danger,
    textAlign: "center",
    marginBottom: 8,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 36,
    width: "100%",
    justifyContent: "center",
    marginBottom: 12,
  },
  signOutTxt: {
    fontFamily: Font.bold,
    fontSize: 15,
    color: "#fff",
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backTxt: {
    fontFamily: Font.semiBold,
    fontSize: 14,
    color: C.textMuted,
  },
});
}
