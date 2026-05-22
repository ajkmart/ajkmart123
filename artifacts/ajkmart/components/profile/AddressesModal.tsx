import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Modal, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { createLogger } from "@/utils/logger";
import { Ionicons } from "@expo/vector-icons";
import { useToast } from "@/context/ToastContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useTheme } from "@/context/ThemeContext";
import {
  spacing, typography,
  API, unwrapApiResponse,
  AJK_CITIES_FALLBACK,
  getErrorMessage, extractApiError,
  type Address,
  getSharedStyles,
} from "./shared";
const log = createLogger("[AddressesModal]");

export function AddressesModal({ visible, userId, token, onClose }: { visible: boolean; userId: string; token?: string; onClose: () => void }) {
  const { colors: C } = useTheme();
  const { modalHdr, empty, primaryBtn, chip, addrHdr, addrAdd, addrItem, LABEL_OPTS } = useMemo(() => getSharedStyles(C), [C]);
  const { showToast } = useToast();
  const { config: platformConfig } = usePlatformConfig();
  const AJK_CITIES = (platformConfig?.cities?.length ? platformConfig.cities : AJK_CITIES_FALLBACK) as string[];
  const [list, setList] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("Home");
  const [addr, setAddr] = useState("");
  const [city, setCity] = useState("Muzaffarabad");
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("Home");
  const [editAddr, setEditAddr] = useState("");
  const [editCity, setEditCity] = useState("Muzaffarabad");
  const [editSaving, setEditSaving] = useState(false);

  const authHdrs: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try { const r = await fetch(`${API}/addresses`, { headers: authHdrs }); const d = unwrapApiResponse<{ addresses?: Address[] }>(await r.json()); setList(d.addresses ?? []); }
    catch (err) {
      log.warn("Addresses load failed:", err instanceof Error ? err.message : String(err));
      showToast("Could not load addresses — tap to refresh", "error");
    }
    setLoading(false);
  }, [userId, token]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const add = async () => {
    if (list.length >= 5) { showToast("Maximum 5 addresses allowed", "error"); return; }
    if (!addr.trim()) { showToast("Address is required", "error"); return; }
    setSaving(true);
    const opt = LABEL_OPTS.find(o => o.label === label) ?? LABEL_OPTS[0];
    try {
      const res = await fetch(`${API}/addresses`, { method: "POST", headers: { "Content-Type": "application/json", ...authHdrs }, body: JSON.stringify({ label, address: addr.trim(), city, icon: opt.icon, isDefault: list.length === 0 }) });
      if (!res.ok) {
        // eslint-disable-next-line ajk-local/no-silent-catch -- error body parse failure falls back to generic message
        const errBody = await res.json().catch(() => ({}));
        throw new Error(extractApiError(errBody, "Could not save address"));
      }
      setAddr(""); setCity("Muzaffarabad"); setShowAdd(false); await load();
      showToast("Address saved!", "success");
    } catch (e: unknown) { showToast(getErrorMessage(e, "Could not save address"), "error"); }
    setSaving(false);
  };
  const del = async (id: string) => {
    try {
      const res = await fetch(`${API}/addresses/${id}`, { method: "DELETE", headers: authHdrs });
      if (!res.ok) throw new Error("Server could not delete address");
      setList(p => p.filter(a => a.id !== id));
      setDeleteConfirmId(null);
      showToast("Address deleted", "info");
    } catch (e: unknown) {
      setDeleteConfirmId(null);
      showToast(getErrorMessage(e, "Could not delete address"), "error");
    }
  };

  const startEdit = (a: Address) => {
    setEditId(a.id);
    setEditLabel(a.label || "Home");
    setEditAddr(a.address || "");
    setEditCity(a.city || "Muzaffarabad");
    setDeleteConfirmId(null);
  };
  const cancelEdit = () => { setEditId(null); };
  const saveEdit = async () => {
    if (!editAddr.trim()) { showToast("Address is required", "error"); return; }
    setEditSaving(true);
    const opt = LABEL_OPTS.find(o => o.label === editLabel) ?? LABEL_OPTS[0];
    try {
      const r = await fetch(`${API}/addresses/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHdrs },
        body: JSON.stringify({ label: editLabel, address: editAddr.trim(), city: editCity, icon: opt?.icon }),
      });
      if (!r.ok) {
        // eslint-disable-next-line ajk-local/no-silent-catch -- error body parse failure falls back to generic message
        const errBody = await r.json().catch(() => ({}));
        throw new Error(extractApiError(errBody, "Could not update address"));
      }
      setList(p => p.map(a => a.id === editId ? { ...a, label: editLabel, address: editAddr.trim(), city: editCity, icon: opt?.icon } : a));
      setEditId(null);
      showToast("Address updated!", "success");
    } catch (e: unknown) { showToast(getErrorMessage(e, "Could not update address"), "error"); }
    setEditSaving(false);
  };

  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const setDefault = async (id: string) => {
    setSettingDefault(id);
    try {
      const r = await fetch(`${API}/addresses/${id}/set-default`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHdrs } });
      if (!r.ok) {
        // eslint-disable-next-line ajk-local/no-silent-catch -- error body parse failure falls back to generic message
        const errBody = await r.json().catch(() => ({}));
        throw new Error(extractApiError(errBody, "Could not set default"));
      }
      setList(p => p.map(a => ({ ...a, isDefault: a.id === id })));
      showToast("Default address set!", "success");
    } catch (e: unknown) { showToast(getErrorMessage(e, "Could not set default"), "error"); }
    setSettingDefault(null);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.surface }}>
        <View style={modalHdr.wrap}>
          <Text style={modalHdr.title}>Saved Addresses</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { if (!showAdd && list.length >= 5) { showToast("Maximum 5 addresses allowed", "error"); return; } setShowAdd(v => !v); }} style={[addrHdr.addBtn, !showAdd && list.length >= 5 && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={showAdd ? "Cancel adding address" : list.length >= 5 ? "Maximum 5 addresses reached" : "Add new address"}>
              <Ionicons name={showAdd ? "close" : "add"} size={17} color={C.textInverse} />
              <Text style={addrHdr.addBtnTxt}>{showAdd ? "Cancel" : `Add New${list.length > 0 ? ` (${list.length}/5)` : ""}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={modalHdr.close} accessibilityRole="button" accessibilityLabel="Close addresses"><Ionicons name="close" size={20} color={C.text} /></TouchableOpacity>
          </View>
        </View>

        {showAdd && (
          <View style={addrAdd.panel}>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
              {LABEL_OPTS.map(o => (
                <TouchableOpacity activeOpacity={0.7} key={o.label} onPress={() => setLabel(o.label)} style={[chip.base, label === o.label && { backgroundColor: o.bg, borderColor: o.color }]} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ selected: label === o.label }}>
                  <Ionicons name={o.icon} size={13} color={label === o.label ? o.color : C.textMuted} />
                  <Text style={[chip.text, label === o.label && { color: o.color }]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={addrAdd.fld}>
              <TextInput value={addr} onChangeText={setAddr} placeholder="Enter full address..." placeholderTextColor={C.textMuted} style={addrAdd.fldTxt} multiline maxLength={500} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {AJK_CITIES.map(c => (
                  <TouchableOpacity activeOpacity={0.7} key={c} onPress={() => setCity(c)} style={[chip.base, city === c && { backgroundColor: C.primarySoft, borderColor: C.primary }]} accessibilityRole="radio" accessibilityLabel={c} accessibilityState={{ selected: city === c }}>
                    <Text style={[chip.text, city === c && { color: C.primary }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity activeOpacity={0.7} onPress={add} disabled={saving} style={[primaryBtn.base, saving && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Save address" accessibilityState={{ disabled: saving }}>
              {saving ? <ActivityIndicator color={C.textInverse} size="small" /> : <Text style={primaryBtn.txt}>Save Address</Text>}
            </TouchableOpacity>
          </View>
        )}

        {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> : list.length === 0 && !showAdd ? (
          <View style={empty.wrap}>
            <Text style={{ fontSize: 52 }}>📍</Text>
            <Text style={empty.title}>No addresses</Text>
            <Text style={empty.sub}>Save your home or office address</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowAdd(true)} style={[primaryBtn.base, { flexDirection: "row", gap: 6, marginTop: spacing.md, alignSelf: "center", width: "auto", paddingHorizontal: spacing.xl }]} accessibilityRole="button" accessibilityLabel="Add address">
              <Ionicons name="add" size={16} color={C.textInverse} />
              <Text style={primaryBtn.txt}>Add Address</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 10 }}>
            {list.map(a => {
              const opt = LABEL_OPTS.find(o => o.label === a.label) ?? LABEL_OPTS[2];
              const isEditing = editId === a.id;
              return (
                <View key={a.id} style={addrItem.wrap}>
                  {isEditing ? (
                    <View style={{ flex: 1 }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          {LABEL_OPTS.map(o => (
                            <TouchableOpacity activeOpacity={0.7} key={o.label} onPress={() => setEditLabel(o.label)} style={[chip.base, editLabel === o.label && { backgroundColor: o.bg, borderColor: o.color }]} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ selected: editLabel === o.label }}>
                              <Ionicons name={o.icon} size={13} color={editLabel === o.label ? o.color : C.textMuted} />
                              <Text style={[chip.text, editLabel === o.label && { color: o.color }]}>{o.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                      <View style={[addrAdd.fld, { marginBottom: spacing.sm }]}>
                        <TextInput value={editAddr} onChangeText={setEditAddr} placeholder="Enter full address..." placeholderTextColor={C.textMuted} style={addrAdd.fldTxt} multiline maxLength={500} />
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          {AJK_CITIES.map(c => (
                            <TouchableOpacity activeOpacity={0.7} key={c} onPress={() => setEditCity(c)} style={[chip.base, editCity === c && { backgroundColor: C.primarySoft, borderColor: C.primary }]} accessibilityRole="radio" accessibilityLabel={c} accessibilityState={{ selected: editCity === c }}>
                              <Text style={[chip.text, editCity === c && { color: C.primary }]}>{c}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity activeOpacity={0.7} onPress={saveEdit} disabled={editSaving} style={[primaryBtn.base, { flex: 1, opacity: editSaving ? 0.7 : 1 }]} accessibilityRole="button" accessibilityLabel="Save address changes" accessibilityState={{ disabled: editSaving }}>
                          {editSaving ? <ActivityIndicator color={C.textInverse} size="small" /> : <Text style={primaryBtn.txt}>Save Changes</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.7} onPress={cancelEdit} style={[primaryBtn.base, { backgroundColor: C.surfaceSecondary, paddingHorizontal: spacing.md, width: "auto" }]} accessibilityRole="button" accessibilityLabel="Cancel editing">
                          <Text style={[primaryBtn.txt, { color: C.textSecondary }]}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={[addrItem.icon, { backgroundColor: opt.bg }]}>
                        <Ionicons name={opt.icon} size={19} color={opt.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={addrItem.label}>{a.label}</Text>
                          {a.isDefault && <View style={addrItem.defBadge}><Text style={addrItem.defTxt}>Default</Text></View>}
                        </View>
                        <Text style={addrItem.addr}>{a.address}</Text>
                        <Text style={addrItem.city}>{a.city}, AJK</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => startEdit(a)} style={addrItem.delBtn} accessibilityRole="button" accessibilityLabel={`Edit ${a.label} address`}>
                          <Ionicons name="pencil-outline" size={16} color={C.primary} />
                        </TouchableOpacity>
                        {!a.isDefault && (
                          <TouchableOpacity activeOpacity={0.7} onPress={() => setDefault(a.id)} disabled={settingDefault === a.id} style={addrItem.setDefBtn} accessibilityRole="button" accessibilityLabel={`Set ${a.label} as default`}>
                            {settingDefault === a.id
                              ? <ActivityIndicator size="small" color={C.primary} />
                              : <Text style={addrItem.setDefTxt}>Set Default</Text>}
                          </TouchableOpacity>
                        )}
                        {deleteConfirmId === a.id ? (
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            <TouchableOpacity activeOpacity={0.7} onPress={() => del(a.id)} style={[addrItem.delBtn, { backgroundColor: C.dangerSoft, paddingHorizontal: 8 }]} accessibilityRole="button" accessibilityLabel="Confirm delete address">
                              <Text style={{ ...typography.smallMedium, color: C.danger }}>Yes</Text>
                            </TouchableOpacity>
                            <TouchableOpacity activeOpacity={0.7} onPress={() => setDeleteConfirmId(null)} style={[addrItem.delBtn, { backgroundColor: C.surfaceSecondary, paddingHorizontal: 8 }]} accessibilityRole="button" accessibilityLabel="Cancel delete">
                              <Text style={{ ...typography.smallMedium, color: C.textMuted }}>No</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity activeOpacity={0.7} onPress={() => setDeleteConfirmId(a.id)} style={addrItem.delBtn} accessibilityRole="button" accessibilityLabel={`Delete ${a.label} address`}>
                            <Ionicons name="trash-outline" size={16} color={C.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                </View>
              );
            })}
            <View style={{ height: 30 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
