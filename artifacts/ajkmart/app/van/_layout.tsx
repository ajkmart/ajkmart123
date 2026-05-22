import { Stack } from "expo-router";

export default function VanLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="seats" />
      <Stack.Screen name="bookings" />
    </Stack>
  );
}
