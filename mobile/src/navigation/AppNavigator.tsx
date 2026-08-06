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
import { navigationRef, navigate } from "./navigationRef";
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
import OliveChatScreen from "../screens/community/OliveChatScreen";
import OliveShopScreen from "../screens/shop/OliveShopScreen";
import ChatRoomScreen from "../screens/community/ChatRoomScreen";
import MembersScreen from "../screens/community/MembersScreen";

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
  OliveChat: undefined;
  OliveShop: undefined;
  ChatRoom: { roomId: string; roomName: string };
  CommunityMembers: undefined;
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

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      // Type the notification payload explicitly rather than using a blind cast.
      const data = (response.notification.request.content.data ?? {}) as {
        type?: string;
        entryId?: string;
        goal?: string;
        desires?: string;
        prayerType?: string;
        previewText?: string;
      };

      if (data.type === "devotion" || data.type === "prayer") {
        const alarmType = data.type as "prayer" | "devotion";
        const hasEntry = !!data.entryId;

        if (hasEntry) {
          setPendingAlarm({
            type: alarmType,
            goal: data.goal,
            desires: data.desires,
            prayerType: data.prayerType,
            entryId: data.entryId,
            previewText: data.previewText,
            timestamp: Date.now(),
          });
          navigate("NotificationAlarm", {
            type: alarmType,
            entryId: data.entryId,
            goal: data.goal,
            desires: data.desires,
            prayerType: data.prayerType,
            previewText: data.previewText,
          });
        } else {
          setPendingAlarm({
            type: alarmType,
            goal: data.goal,
            desires: data.desires,
            prayerType: data.prayerType ?? "Petition",
            timestamp: Date.now(),
          });
          if (alarmType === "devotion") {
            navigate("Devotions");
          } else {
            navigate("Prayer");
          }
        }
      }
    });
    return () => sub.remove();
  }, []);

  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />;
  }

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
              <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
              <Stack.Screen name="BibleHome" component={BibleHomeScreen} options={{ title: "Bible" }} />
              <Stack.Screen name="BookPicker" component={BookPickerScreen} options={{ title: "Books" }} />
              <Stack.Screen
                name="ChapterReader"
                component={ChapterReaderScreen}
                options={({ route }) => ({ title: `${route.params.bookName} ${route.params.chapter}` })}
              />
              <Stack.Screen name="Notes" component={NotesScreen} options={{ title: "Highlights & Notes" }} />
              <Stack.Screen name="HymnsList" component={HymnsListScreen} options={{ title: "Hymns" }} />
              <Stack.Screen name="HymnDetail" component={HymnDetailScreen} options={{ title: "" }} />
              <Stack.Screen name="Devotions" component={DevotionsScreen} options={{ title: "Devotions" }} />
              <Stack.Screen name="Prayer" component={PrayerScreen} options={{ title: "Prayer" }} />
              <Stack.Screen name="Bulletin" component={BulletinScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Donate" component={DonateScreen} options={{ headerShown: false }} />

              {/* ── Olive Shop ── */}
              <Stack.Screen
                name="OliveShop"
                component={OliveShopScreen}
                options={{ headerShown: false }}
              />

              {/* ── Olive Chat ── */}
              <Stack.Screen
                name="OliveChat"
                component={OliveChatScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="ChatRoom"
                component={ChatRoomScreen}
                options={{
                  title: "",
                  headerStyle: { backgroundColor: colors.oliveDark },
                  headerTintColor: colors.parchment,
                }}
              />
              <Stack.Screen
                name="CommunityMembers"
                component={MembersScreen}
                options={{ title: "New Message" }}
              />

              <Stack.Screen
                name="NotificationAlarm"
                component={NotificationAlarmScreen}
                options={{ headerShown: false, presentation: "fullScreenModal" }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <OliveBranch />
      {session ? <FloatingRecordingWidget /> : null}
    </>
  );
}
