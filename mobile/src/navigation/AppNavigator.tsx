import React, { useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/theme";
import type { BibleVersion } from "../screens/bible/BibleHomeScreen";
import OliveBranch from "../components/OliveBranch";
import SkeletonHomeLoader from "../components/SkeletonHomeLoader";
import FloatingRecordingWidget from "../components/FloatingRecordingWidget";
import { navigationRef } from "./navigationRef";
import { setPendingAlarm } from "../lib/alarmState";

import SplashScreen from "../screens/SplashScreen";
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
  BookPicker: { version?: BibleVersion } | undefined;
  ChapterReader: { bookId: number; bookName: string; chapter: number; version?: BibleVersion; initialVerse?: number };
  Notes: undefined;
  HymnsList: undefined;
  HymnDetail: { hymnId: string };
  Devotions: undefined;
  Prayer: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { session, loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  // Handle notification taps — routes the user to the correct screen and
  // pre-fills alarm data so the screen can offer a fresh generation.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as Record<string, string>;
      if (data.type === "devotion") {
        setPendingAlarm({ type: "devotion", goal: data.goal ?? "", timestamp: Date.now() });
        // Navigate even if not yet authenticated — NavigationContainer will
        // show the auth screen, and the pending alarm will be consumed once
        // the user signs in and reaches the Devotions screen.
        navigationRef.current?.navigate("Devotions" as never);
      } else if (data.type === "prayer") {
        setPendingAlarm({ type: "prayer", desires: data.desires ?? "", prayerType: data.prayerType ?? "Petition", timestamp: Date.now() });
        navigationRef.current?.navigate("Prayer" as never);
      }
    });
    return () => sub.remove();
  }, []);

  // Show splash while auth is loading OR before splash finishes
  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />;
  }

  // Auth still resolving after splash — show a shimmering skeleton instead
  // of a dead blank screen, so the app always feels alive while loading.
  if (loading) return <SkeletonHomeLoader />;

  return (
    <>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.oliveDark },
            headerTintColor: colors.parchment,
            headerTitleStyle: { fontWeight: "700", fontSize: 17 },
            contentStyle: { backgroundColor: colors.parchment },
            headerShadowVisible: false,
          }}
        >
          {!session ? (
            <Stack.Screen
              name="Home"
              component={AuthScreen}
              options={{ headerShown: false }}
            />
          ) : (
            <>
              <Stack.Screen
                name="Home"
                component={HomeScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="BibleHome"
                component={BibleHomeScreen}
                options={{ title: "Bible" }}
              />
              <Stack.Screen
                name="BookPicker"
                component={BookPickerScreen}
                options={{ title: "Books" }}
              />
              <Stack.Screen
                name="ChapterReader"
                component={ChapterReaderScreen}
                options={({ route }) => ({
                  title: `${route.params.bookName} ${route.params.chapter}`,
                })}
              />
              <Stack.Screen name="Notes" component={NotesScreen} options={{ title: "Highlights & Notes" }} />
              <Stack.Screen name="HymnsList" component={HymnsListScreen} options={{ title: "Hymns" }} />
              <Stack.Screen name="HymnDetail" component={HymnDetailScreen} options={{ title: "" }} />
              <Stack.Screen name="Devotions" component={DevotionsScreen} options={{ title: "Devotions" }} />
              <Stack.Screen name="Prayer" component={PrayerScreen} options={{ title: "Prayer" }} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      {/* Global decorative branch — sits above every screen in the app. */}
      <OliveBranch />
      {/* Floating control for an in-progress recording/transcription — visible
          no matter which screen the user navigates to, tapping it jumps back
          to Highlights & Notes. */}
      {session ? <FloatingRecordingWidget /> : null}
    </>
  );
}
