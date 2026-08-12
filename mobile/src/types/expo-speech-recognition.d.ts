declare module 'expo-speech-recognition' {
  import type { EventSubscription } from 'react-native';

  export type ExpoSpeechRecognitionOptions = {
    lang?: string;
    interimResults?: boolean;
    maxAlternatives?: number;
    continuous?: boolean;
  };

  export type SpeechRecognitionResultSegment = {
    transcript: string;
    confidence: number;
    isFinal: boolean;
  };

  export type SpeechRecognitionResult = {
    isFinal: boolean;
    results: SpeechRecognitionResultSegment[];
    transcript?: string;
  };

  export type SpeechRecognitionError = {
    code: string;
    message?: string;
  };

  export type PermissionResponse = {
    status: string;
    granted: boolean;
    canAskAgain: boolean;
    expires: string | number;
  };

  export const ExpoSpeechRecognitionModule: {
    start(options?: ExpoSpeechRecognitionOptions): void;
    stop(): void;
    abort(): void;
    getSupportedLocales(): Promise<string[]>;
    isRecognitionAvailable(): Promise<boolean>;
    getPermissionsAsync(): Promise<PermissionResponse>;
    requestPermissionsAsync(): Promise<PermissionResponse>;
  };

  export function useSpeechRecognitionEvent(
    event: 'result',
    handler: (event: { results: SpeechRecognitionResultSegment[]; isFinal: boolean }) => void
  ): void;
  export function useSpeechRecognitionEvent(
    event: 'error',
    handler: (event: SpeechRecognitionError) => void
  ): void;
  export function useSpeechRecognitionEvent(
    event: 'start' | 'end' | 'speechstart' | 'speechend',
    handler: () => void
  ): void;
  export function useSpeechRecognitionEvent(
    event: string,
    handler: (...args: any[]) => void
  ): void;
}
