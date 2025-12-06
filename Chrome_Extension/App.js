import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { StartScreen } from "../components/StartScreen";
import { EmailAssistant } from "../components/EmailAssistant"
import { FocusModeWebcam } from "../components/FocusModeWebcam";
import { LinkedIn } from "../components/LinkedIn";


const Stack = createNativeStackNavigator(); // creating a stack that will be used to navigate to different screens
function App() {
  //bringing all of the screens together
  return (
    //will show all code following return(), it signifies the beginging of the HTML part of React Native
    <NavigationContainer>
      {
        <Stack.Navigator
          initialRouteName="StartScreen"
        >
          <Stack.Screen
            name="StartScreen"
            component={StartScreen}
          />
          <Stack.Screen
            name="LinkedIn"
            component={LinkedIn}
          />
          <Stack.Screen
            name="FocusModeWebcam"
            component={FocusModeWebcam}
          />
          <Stack.Screen
            name="EmailAssistant"
            component={EmailAssistant}
          />
        </Stack.Navigator>
      }
    </NavigationContainer>
  );
}

export default App; //sending the information to the devices
