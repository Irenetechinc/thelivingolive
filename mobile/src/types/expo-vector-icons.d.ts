declare module '@expo/vector-icons' {
  import * as React from 'react';
  import { TextProps } from 'react-native';

  export interface IconProps extends TextProps {
    name: string;
    size?: number;
    color?: string;
  }

  export class Ionicons extends React.Component<IconProps> {}
  export class MaterialIcons extends React.Component<IconProps> {}
  export class FontAwesome extends React.Component<IconProps> {}
  export class FontAwesome5 extends React.Component<IconProps> {}
  export class MaterialCommunityIcons extends React.Component<IconProps> {}
  export class Feather extends React.Component<IconProps> {}
  export class AntDesign extends React.Component<IconProps> {}
  export class Entypo extends React.Component<IconProps> {}
}
