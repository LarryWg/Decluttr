import { View, Text, Button, TextInput } from "react-native";
import { useNavigation } from "@react-navigation/native";

import styles from "../Styles/Styles";

//can you put buttons in a modal? -ask modal
export function StartScreen() {
  const navigation = useNavigation();
  
  return (
    <View style={styles.container}>
          <Button
            title="LinkedIn"
            onPress={() => navigation.navigate("LinkedIn")}
          />
          <Button
            title="FocusModeWebcam"
            onPress={() => navigation.navigate("FocusModeWebcam")}
          />
          <Button
            title="EmailAssistant"
            onPress={() => navigation.navigate("EmailAssistant")} 
          />
    </View>
  );
}
