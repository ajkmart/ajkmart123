import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { ActivityIndicator, View } from "react-native";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function RootIndex() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background }}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  return <Redirect href="/(tabs)" />;
}
