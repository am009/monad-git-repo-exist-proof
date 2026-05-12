# HackStamp

HackStamp is a Monad testnet app that anchors Git commit hashes on-chain to prove a repository existed before a deadline.

[Intro video](./video/Intro.mp4)

黑客松活动，在项目提交时，有的队伍可能会在截止时间后依然去偷偷修改项目的内容

有的人会说，根据项目的截止时间，排除掉后面的提交就可以了，但是，git的历史也是可以被篡改的，可以假装自己的截止之前提交的！

难道说黑客松就必须让每个队伍提交项目压缩包了吗？这对服务器的要求也很高。不，只需要提交项目的commit哈希即可！

本项目创建了一个简单的合约，将相关的哈希上链，这样可以证明项目已经完成。后续如果git历史被篡改，会让访问指定哈希状态的链接返回404！

## Submission notes

- Public repository: https://github.com/am009/monad-git-repo-exist-proof
- OKX skill suite touchpoint: installed the `plugin-store` skill with `npx skills add okx/plugin-store --skill plugin-store`
- Main proof flow: enter a GitHub repo URL and commit hash, then anchor the hash on-chain

### Install dependencies

```bash
npm install
```

### Set up the environment variables

No environment variables are required for the current web wallet flow.

## Folder structure of the template

```
react-native-privy-embedded-wallet-template/
  ├── app/                                   # Expo router entrypoint
  │   ├── _layout.tsx                        # Root Layout
  │   └── index.tsx                          # First screen
  ├── assets/
  │   ├── fonts/                             # Custom fonts go here
  │   └── images/ 
  │       ├── adaptive-icon.png
  │       ├── favicon.png
  │       ├── icon.png
  │       ├── monad-logo-inverted.png
  │       └── monad-logo.png
  │   └── readme/                            # images for the readme, you can delete this
  ├── constants/
  │   └── Colors.ts
  ├── app.json                               # App properties
  ├── babel.config.js
  ├── eas.json
  ├── entrypoint.js
  ├── eslint.config.js
  ├── metro.config.js                        # Configuration for Hermes and Polyfills
  ├── package-lock.json
  ├── package.json
  ├── README.md
  ├── tsconfig.json
  ├── types/
  │   └── react-native-qrcode-styled.d.ts
```

## Modifying the app name

<table width="100%">
  <tr>
    <th width="50%">iOS</th>
    <th width="50%">Android</th>
  </tr>
  <tr>
    <td align="center">
      <img src="/assets/readme/icon_ios.png" width="300"/>
    </td>
    <td align="center">
      <img src="/assets/readme/icon_android.png" width="300"/>
    </td>
  </tr>
</table>

Edit the `name` property in the `app.json` file.

```json
{
   "expo": {
      "name": "wallet-app", <--- Edit this
      ...
   }
}  
```

## Modifying the App Icon & Splash Screen

### App Icon

<table width="100%">
  <tr>
    <th width="50%">iOS</th>
    <th width="50%">Android</th>
  </tr>
  <tr>
    <td align="center">
      <img src="/assets/readme/icon_ios.png" width="300"/>
    </td>
    <td align="center">
      <img src="/assets/readme/icon_android.png" width="300"/>
    </td>
  </tr>
</table>

You can edit the app icon by replacing the `assets/images/icon.png` file.

Recommended App Icon size is `1024x1024`.

If you name the icon file something else then edit the `icon` property in `app.json` accordingly.

```json
{
   "expo": {
      "name": "rn-wallet-app",
      ...
      "icon": "./assets/images/icon.png", <--- Change this
      ...
   }
}
```

### Splash Screen

<table width="100%">
  <tr>
    <th width="50%">iOS</th>
    <th width="50%">Android</th>
  </tr>
  <tr>
    <td align="center">
      <img src="/assets/readme/splash_ios.png" width="300"/>
    </td>
    <td align="center">
      <img src="/assets/readme/splash_android.png" width="300"/>
    </td>
  </tr>
</table>

Edit the `splash` object in `app.json` to modify the splash screen.

```json
{
   "expo": {
      "name": "rn-wallet-app",
      ...
      "splash": { <--- Edit this object
         "image": "./assets/images/icon.png",
         "backgroundColor": "#ffffff"
      }
   }  
}
```

## Modifying fonts for the app

## Modifying the deeplinking scheme

Edit the `scheme` property in `app.json` file, for your custom deeplinking scheme.

```json
{
  "expo": {
    ...
    "scheme": "rnwalletapp",
    ...
  }
}
```

For example, if you set this to `rnwalletapp`, then `rnwalletapp://` URLs would open your app when tapped.

This is a build-time configuration, it has no effect in Expo Go.

## Editing the landing screen

<table width="100%">
  <tr>
    <th width="50%">iOS</th>
    <th width="50%">Android</th>
  </tr>
  <tr>
    <td align="center">
      <img src="/assets/readme/landing_screen_ios.png" width="300"/>
    </td>
    <td align="center">
      <img src="/assets/readme/landing_screen_android.png" width="300"/>
    </td>
  </tr>
</table>

You can edit the landing page by editing the code in the file `app/index.tsx`.

## Wallet Actions

The template has example code for the following Wallet Actions:

- [Send USDC](https://github.com/monad-developers/react-native-privy-embedded-wallet-template/blob/demo/components/sheets/SendSheet.tsx) 
- [Sign Message](https://github.com/monad-developers/react-native-privy-embedded-wallet-template/blob/demo/components/sheets/SignSheet.tsx)


## Modifying the package/bundle identifier

When publishing app to the app store you need to have a unique package/bundle identifier you can change it in in `app.json`.

> [!NOTE]
> Don't forget to the change the identifier in Privy dashboard

```json
{
  "expo": {
    "name": "rn-wallet-app",
    ...
    "ios": {
      "bundleIdentifier": "com.anonymous.rn-wallet-app", <--- Edit this
      ...
    },
    "android": {
      ...
      "package": "com.anonymous.rnwalletapp" <--- Edit this
    },
  }
}
```

## Check out the demo app

If you want try the demo app before you start developing you can switch to the `demo` branch available with the repo:

```bash
git checkout demo
```

### Folder structure of the demo project (Change to `demo` branch to view this)

```
react-native-privy-embedded-wallet-template/
  ├── app/
  │   ├── _layout.tsx                        # Root layout of the project
  │   ├── +not-found.tsx
  │   ├── demo/                              # This is entrypoint for the Wallet related code.
  │   │   ├── _layout.tsx
  │   │   ├── app/                           # If Authenticated the user can access route /app
  │   │   │   ├── _layout.tsx
  │   │   │   └── index.tsx
  │   │   └── sign-in/                       # Unauthenticated user gets redirected to /sign-in
  │   └── index.tsx                          # This is the landing page
  ├── assets/
  │   ├── fonts/                             # Custom fonts go here
  │   │   └── SF_Pro_Rounded/                # Custom Font example
  │   └── images/
  │       ├── adaptive-icon.png
  │       ├── favicon.png
  │       ├── icon.png
  │       ├── monad-icon.png
  │       ├── monad-logo-inverted.png
  │       ├── monad-logo.png
  │       ├── partial-react-logo.png
  │       └── splash-icon.png
  ├── components/
  │   ├── sheets/                            # All the bottom sheets are here
  │   └── ui/
  ├── config/
  │   ├── privyConfig.ts                     # Privy related config
  │   ├── providers.tsx 
  │   └── wagmiConfig.ts                     # Monad Testnet related config
  ├── constants/
  ├── context/
  │   ├── AuthContext.tsx
  │   └── WalletContext.tsx                  # Wallet actions implementations are here
  ├── hooks/
  ├── screens/
  │   ├── Email/                             # Screen that asks for Email
  │   ├── Home/                              # Wallet Home screen (Authenticated users only)
  │   ├── Landing/                           # Screen with info on how to use the template
  │   └── OTP/                               # Screen that asks for the OTP code sent to email
  ├── types/
  ├── utils.ts
  ├── entrypoint.ts
  ├── app.json
  ├── babel.config.js
  ├── eas.json
  ├── eslint.config.js
  ├── metro.config.js
  ├── package.json
  ├── package-lock.json
  ├── README.md
  ├── tsconfig.json
```

## Learn more

To learn more about developing your project with Expo, Privy, and Monad look at the following resources:

- [Expo documentation](https://docs.expo.dev/)
- [Expo guides](https://docs.expo.dev/guides)
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/)
- [Creating embedded wallet on the client side](https://docs.privy.io/wallets/wallets/create/create-a-wallet)
- [Sending transactions using embedded wallet](https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction)
- [Signing transactions using embedded wallet](https://docs.privy.io/wallets/using-wallets/ethereum/sign-a-transaction)
- [Tooling and infra options on Monad](https://docs.monad.xyz/tooling-and-infra/)

## Join the community

- [Discord community](https://discord.com/invite/monaddev): Chat with fellow Monad developers and ask questions.

Facing issues? report [here](https://github.com/monad-developers/react-native-privy-embedded-wallet-template/issues).
