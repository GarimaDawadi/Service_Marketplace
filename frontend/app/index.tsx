import { ActivityIndicator, View } from "react-native";
import { PRIMARY, BACKGROUND } from "../src/theme/colors";

export default function EntryScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BACKGROUND }}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </View>
  );
}
