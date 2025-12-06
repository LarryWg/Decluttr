import { StyleSheet } from "react-native";

export default StyleSheet.create({
  /*creating a classs which contains all of the visual parameters used within the code*/

  container: {
    flex: 1, //acesses flex to be able to use in the futur
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 30,
  },
  containerHeader: {
    flex: 1, //acesses flex to be able to use in the futur
    justifyContent: "space-around",
    alignItems: "start",
    margin: 0,
    maxHeight: 100,
  },
  title: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
    fontSize: 80,
  },
  mediumText: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
    fontSize: 40,
  },
  row: {
    flexDirection: "row", //aligning the objects horizontally
    justifyContent: "space-around", //spacing the objects equally
  },
  pressableContainer: {
    backgroundColor: "#00aeef",
    borderColor: "red",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  textContainer: {
    justifyContent: "start", //aligning object to top left corner
    marginHorizontal: 16, //space around
    paddingTop: 10, //space around
  },
  board: { 
    flexDirection: 'column', 
}, 
  
});
