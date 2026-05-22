import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { authColors as C, InputField } from "@/components/auth-shared";
import { s } from "./registerStyles";

export interface RegisterStep3Props {
  gpsLoading: boolean;
  gpsStatus: string;
  latitude: string;
  longitude: string;
  showCityPicker: boolean;
  setShowCityPicker: (v: boolean) => void;
  city: string;
  setCity: (v: string) => void;
  citySearch: string;
  setCitySearch: (v: string) => void;
  filteredCities: string[];
  area: string;
  setArea: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  error: string;
  clearError: () => void;
  handleGetLocation: () => void;
}

export function RegisterStep3({
  gpsLoading, gpsStatus, latitude, longitude,
  showCityPicker, setShowCityPicker, city, setCity, citySearch, setCitySearch, filteredCities,
  area, setArea, address, setAddress, error, clearError, handleGetLocation,
}: RegisterStep3Props) {
  return (
    <>
      <TouchableOpacity activeOpacity={0.7}
        onPress={handleGetLocation}
        disabled={gpsLoading}
        style={s.gpsButton}
        accessibilityRole="button"
        accessibilityLabel="Use GPS to fill address"
      >
        {gpsLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="navigate" size={20} color="#fff" />
        )}
        <Text style={s.gpsButtonText}>{gpsLoading ? "Getting Location..." : "Use My Current Location"}</Text>
      </TouchableOpacity>
      {!!gpsStatus && (
        <Text style={[s.gpsStatusText, gpsStatus.includes("denied") && { color: C.danger }]}>{gpsStatus}</Text>
      )}
      {!!(latitude && longitude) && (
        <View style={s.coordsRow}>
          <Ionicons name="location" size={14} color={C.success} />
          <Text style={s.coordsText}>{latitude}, {longitude}</Text>
        </View>
      )}

      <View style={s.dividerRow}>
        <View style={s.dividerLine} />
        <Text style={s.dividerText}>or enter manually</Text>
        <View style={s.dividerLine} />
      </View>

      <Text style={s.fieldLabel}>City *</Text>
      <TouchableOpacity activeOpacity={0.7}
        onPress={() => setShowCityPicker(!showCityPicker)}
        style={[s.pickerButton, !city && !!error && s.pickerError]}
      >
        <Text style={[s.pickerButtonText, !city && { color: C.textMuted }]}>{city || "Select your city"}</Text>
        <Ionicons name={showCityPicker ? "chevron-up" : "chevron-down"} size={20} color={C.textMuted} />
      </TouchableOpacity>
      {showCityPicker && (
        <View style={s.cityDropdown}>
          <View style={s.citySearchWrap}>
            <Ionicons name="search" size={16} color={C.textMuted} />
            <InputField value={citySearch} onChangeText={setCitySearch} placeholder="Search city..." />
          </View>
          <ScrollView style={s.cityList} nestedScrollEnabled>
            {filteredCities.map(c => (
              <TouchableOpacity activeOpacity={0.7}
                key={c}
                onPress={() => { setCity(c); setShowCityPicker(false); setCitySearch(""); clearError(); }}
                style={[s.cityItem, city === c && s.cityItemSelected]}
              >
                <Text style={[s.cityItemText, city === c && s.cityItemTextSelected]}>{c}</Text>
                {city === c && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
              </TouchableOpacity>
            ))}
            {filteredCities.length === 0 && <Text style={s.noCityText}>No cities found</Text>}
          </ScrollView>
        </View>
      )}

      <InputField
        label="Area / Locality"
        value={area}
        onChangeText={v => { setArea(v); clearError(); }}
        placeholder="e.g. Satellite Town, Block B"
        autoCapitalize="words"
      />
      <InputField
        label="Full Address"
        value={address}
        onChangeText={v => { setAddress(v); clearError(); }}
        placeholder="House/flat no, street, landmark"
        autoCapitalize="sentences"
        multiline
      />
    </>
  );
}
