import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/theme";

import HomeScreen from "../screens/HomeScreen";
import AuthScreen from "../screens/AuthScreen";
import BibleHomeScreen from "../screens/bible/BibleHomeScreen";
import BookPickerScreen from "../screens/bible/BookPickerScreen";
import ChapterReaderScreen from "../screens/bible/ChapterReaderScreen";
import NotesScreen from "../screens/bible/NotesScreen";
import HymnsListScreen from "../screens/hymns/HymnsListScreen";
import HymnDetailScreen from "../screens/hymns/HymnDetailScreen";
import DevotionsScreen from "../screens/devotions/DevotionsScreen";
import PrayerScreen from "../screens/prayer/PrayerScreen";

export type RootStackParamList = {
  Home: undefined;
  BibleHome: undefined;
  BookPicker: { versesMode?: boolean } | undefined;
  ChapterReader: { bookId: number; bookName: string; chapter: number };
  Notes: undefined;
  HymnsList: undefined;
  HymnDetail: { hymnId: string };
  Devotions: undefined;
  Prayer: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.parchment },
          headerTintColor: colors.oliveDark,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.parchment },
        }}
      >
        {!session ? (
          <Stack.Screen name="Home" component={AuthScreen} options={{ title: "The Living Olive" }} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: "The Living Olive" }} />
            <Stack.Screen name="BibleHome" component={BibleHomeScreen} options={{ title: "Bible" }} />
            <Stack.Screen name="BookPicker" component={BookPickerScreen} options={{ title: "Books" }} />
            <Stack.Screen
              name="ChapterReader"
              component={ChapterReaderScreen}
              options={({ route }) => ({ title: `${route.params.bookName} ${route.params.chapter}` })}
            />
            <Stack.Screen name="Notes" component={NotesScreen} options={{ title: "My Notes" }} />
            <Stack.Screen name="HymnsList" component={HymnsListScreen} options={{ title: "Hymns" }} />
            <Stack.Screen name="HymnDetail" component={HymnDetailScreen} options={{ title: "" }} />
            <Stack.Screen name="Devotions" component={DevotionsScreen} options={{ title: "Devotions" }} />
            <Stack.Screen name="Prayer" component={PrayerScreen} options={{ title: "Prayer" }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
