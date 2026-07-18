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
import NotificationAlarmScreen from "../screens/NotificationAlarmScreen";
import BulletinScreen from "../screens/bulletins/BulletinScreen";
import DonateScreen from "../screens/donate/DonateScreen";

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
  Bulletin: undefined;
  Donate: undefined;
  NotificationAlarm: {
    type: "prayer" | "devotion";
    entryId?: string;
    goal?: string;
    desires?: string;
    prayerType?: string;
    previewText?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { session, loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  // Handle notification taps — shows the alarm screen with pre-generated content.
  // When the server sends a scheduled push, it includes an entryId pointing to
  // content already saved in Supabase, so the user never has to tap "Generate".
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as Record<string, string>;

      if (data.type === "devotion" || data.type === "prayer") {
        const hasEntry = !!data.entryId;

        if (hasEntry) {
          // Server pre-generated content — show the alarm screen directly.
          // Also store the alarm state so Prayer/Devotions screen knows to
          // scroll to the latest entry on arrival.
          setPendingAlarm({
            type: data.type,
            goal: data.goal,
            desires: data.desires,
            prayerType: data.prayerType,
            entryId: data.entryId,
            previewText: data.previewText,
            timestamp: Date.now(),
          });
          (navigationRef.current as any)?.navigate("NotificationAlarm", {
            type: data.type,
            entryId: data.entryId,
            goal: data.goal,
            desires: data.desires,
            prayerType: data.prayerType,
            previewText: data.previewText,
          });
        } else {
          // Older-style push without pre-generated content — fall back to
          // navigating directly to the relevant screen with prefilled data.
          setPendingAlarm({
            type: data.type,
            goal: data.goal,
            desires: data.desires,
            prayerType: data.prayerType ?? "Petition",
            timestamp: Date.now(),
          });
          if (data.type === "devotion") {
            navigationRef.current?.navigate("Devotions" as never);
          } else {
            navigationRef.current?.navigate("Prayer" as never);
          }
        }
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
              <Stack.Screen name="Bulletin" component={BulletinScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Donate" component={DonateScreen} options={{ headerShown: false }} />
              <Stack.Screen
                name="NotificationAlarm"
                component={NotificationAlarmScreen}
                options={{ headerShown: false, presentation: "fullScreenModal" }}
              />
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
