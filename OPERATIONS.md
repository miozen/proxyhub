# 杩愮淮涓庢仮澶?

## 缁勪欢鎺у埗

```sh
proxyhub status
proxyhub status proxyhub
proxyhub status sub-store
proxyhub start proxyhub
proxyhub stop sub-store
proxyhub restart proxyhub
proxyhub logs proxyhub --tail=100
proxyhub logs sub-store -f
```

涓嶆寚瀹氱粍浠剁殑 `start`銆乣stop`銆乣restart`銆乣status` 鍜?`logs` 浼氭搷浣滄垨
鏄剧ず涓や釜缁勪欢銆傛寚瀹氱粍浠舵椂鍙搷浣滆瀹瑰櫒銆?

## 鏇存柊

```sh
proxyhub check-updates
proxyhub update proxyhub
proxyhub update sub-store
proxyhub update proxyhub --version 0.1.5
proxyhub update sub-store --version 2.36.21
proxyhub update proxyhub --image ghcr.io/miozen/proxyhub:<tag-or-digest>
proxyhub update sub-store --image xream/sub-store:<tag-or-digest>
```

鏇存柊鍛戒护灞曠ず褰撳墠闀滃儚銆佸€欓€夋爣绛惧拰鐩爣 digest锛屽苟瑕佹眰纭锛涜嚜鍔ㄥ寲浣跨敤
`--yes`銆侾roxyHub 浠庢湰浠撳簱鏈€鏂?Release 鍙戠幇绋冲畾鐗堟湰锛孲ub-Store 浠庡畼鏂?
`xream/sub-store:latest` 鍙戠幇绋冲畾鐗堟湰銆傝В鏋愬悗鍧囧浐瀹氫负涓嶅彲鍙?digest銆?

鏇存柊浠呭浠藉苟閲嶅缓鎵€閫夌粍浠躲€傜洰鏍?digest 鏈彉鍖栨椂涓や釜瀹瑰櫒鍧囦笉閲嶅惎銆?
鎷夊彇銆侀噸寤烘垨鍋ュ悍妫€鏌ュけ璐ユ椂鑷姩鎭㈠鎵€閫夌粍浠躲€傛墜鍔ㄥ洖婊氾細

```sh
proxyhub rollback proxyhub
proxyhub rollback sub-store
```

姣忎釜缁勪欢淇濈暀鏈€杩?5 浠借嚜鍔ㄦ洿鏂板墠澶囦唤锛涙墜鍔ㄥ浠戒笉鍙備笌姝ゆ竻鐞嗐€?

## 澶囦唤涓庢仮澶?
```sh
# 瀹屾暣澶囦唤锛涚渷鐣?all 浠嶄繚鎸佸吋瀹?proxyhub backup
proxyhub backup before-change
proxyhub backup all before-full-change

# 鍗曠粍浠跺浠?proxyhub backup proxyhub before-proxyhub-change
proxyhub backup sub-store before-substore-change

# 鎭㈠
proxyhub restore /var/lib/proxyhub/backups/full/before-change
proxyhub restore \
  /var/lib/proxyhub/backups/components/sub-store/before-substore-change
```

瀹屾暣澶囦唤鍜屾仮澶嶄細鐭殏鍋滄涓や釜鏈嶅姟銆傚崟缁勪欢澶囦唤涓庢仮澶嶅彧鎿嶄綔鎸囧畾鏈嶅姟锛?涓嶄細閲嶅缓鍙︿竴涓鍣ㄣ€傛柊澶囦唤鍖呭惈鍙楅檺鍏冩暟鎹拰 SHA256 鏍￠獙锛屾牎楠屽け璐ユ椂
鎭㈠浼氬湪鍋滄瀹瑰櫒鍓嶆嫆缁濄€侰LI 鍙帴鍙?`/var/lib/proxyhub/backups/` 鍐呯殑
鎭㈠璺緞锛涜法鏈哄櫒鎭㈠闇€鍏堝皢澶囦唤澶嶅埗鍥炶鐩綍銆傚嵏杞藉墠闇€鎶婅淇濈暀鐨勫浠?澶嶅埗鍒?`/var/lib/proxyhub` 涔嬪銆?
鎵€鏈夋湁鐘舵€佽繍缁村懡浠ょ敱 `/run/lock/proxyhub.lock` 涓茶鍖栥€傞攣浼氳褰?PID銆?鍛戒护鍜屽紑濮嬫椂闂达紱浠嶅瓨娲荤殑鎸佹湁鑰呬細闃绘骞跺彂鎿嶄綔锛屽彧鍦ㄧ‘璁?PID 宸蹭笉瀛樺湪
鍚庢竻鐞嗛檲鏃ч攣銆俙status`銆乣logs` 鍜?`check-updates` 淇濇寔鍙涓斾笉鑾峰彇閿併€?
`status` 鐜板湪鍒嗗埆鎶ュ憡瀹瑰櫒鐘舵€併€佺粍浠惰嚜韬仴搴枫€佷緷璧栧仴搴峰拰鎬讳綋灏辩华鐘舵€併€?Sub-Store 鑷韩鍋ュ悍鍚屾椂楠岃瘉鍚庣 `/api/utils/env` 鍜屽畼鏂瑰墠绔€?
## 瀹夎杈圭晫

- TTY 榛樿杩涘叆鍗婁氦浜掑畨瑁咃細鏈寚瀹氭椂璇㈤棶绔彛銆佸彧鍦ㄤ緷璧栫己澶辨椂璇㈤棶瀹夎锛?  鏈€鍚庡睍绀鸿В鏋愬悗鐨勪富鏈恒€乁RL銆侀暅鍍?digest銆佸鍣ㄣ€佸嵎鍜岃矾寰勬憳瑕併€?- 骞插噣瀹夎纭鏄?`[Y/n]`锛涜嚜鍔ㄥ寲蹇呴』浣跨敤 `--yes`锛岄潪 TTY 姘镐笉绛夊緟杈撳叆銆?- 榛樿绔彛鍗犵敤鏃讹紝TTY 鍙緭鍏ユ柊绔彛锛涜嚜鍔ㄥ寲蹇呴』鏄惧紡浼?  `--port <available-port> --yes`銆?- 鏈€缁堢‘璁ゅ墠涓嶄細鍒涘缓 ProxyHub 鍙楃鐩綍銆侀厤缃垨鏁版嵁鍗枫€傛垚鍔熷悗浠?`0600`
  鍘熷瓙鍐欏叆 `/var/lib/proxyhub/state/installation`銆?- 瀹夎鍣ㄥ彧鎵ц鍏ㄦ柊瀹夎锛涘彂鐜颁换浣曞彈绠＄姸鎬佸嵆鎷掔粷銆?- 鏁版嵁淇濈暀鍗囩骇鍙娇鐢?`proxyhub update`銆?
- 骞插噣瑕嗙洊瀹夎闇€瑕侊細

```sh
PROXYHUB_REPLACE_CONFIRM=DELETE \
  /tmp/proxyhub-install.sh --replace --yes
```

瑕嗙洊瀹夎浼氬厛鏍￠獙璧勪骇鍜岄暅鍍忥紝鍐嶆案涔呭垹闄ゅ叏閮ㄥ彈绠＄姸鎬佸苟鍒涘缓鏂板疄渚嬨€?

## 鍗歌浇杈圭晫

```sh
# 浜や簰杈撳叆 DELETE
proxyhub uninstall

# 闈炰氦浜?
PROXYHUB_UNINSTALL_CONFIRM=DELETE proxyhub uninstall
```

鍗歌浇姘镐箙鍒犻櫎 ProxyHub銆丼ub-Store銆侀厤缃€佸瘑閽ャ€佸唴閮ㄥ浠姐€佹棩蹇楀拰涓や釜
Docker 鏁版嵁鍗凤紝涓嶆彁渚涗繚鐣欏彈绠℃暟鎹殑鍗歌浇妯″紡銆侱ocker銆佸涓绘満杞欢鍖呫€?
澶栭儴澶囦唤鍜岄暅鍍忕紦瀛樹笉鍦ㄥ垹闄よ寖鍥淬€?

## 瀹归噺杈圭晫

- 姣忎釜瀹瑰櫒鏃ュ織锛歚5MB 脳 3`銆?
- 姣忕敤鎴风敓鎴愯褰曪細鏈€杩?10 娆°€?
- 姣忕粍浠惰嚜鍔ㄦ洿鏂板浠斤細鏈€杩?5 浠姐€?
- 鏈€杩戞垚鍔熼厤缃紦瀛樼嫭绔嬩繚瀛橈紝涓嶅彈鐢熸垚璁板綍娓呯悊褰卞搷銆?

鎭㈠鍚庡簲楠岃瘉 `/healthz`銆乷wner 鐧诲綍銆侀厤缃敓鎴愩€丼ub-Store 鍓嶇/鍚庣銆?
澶囦唤鎭㈠鍙婇噸鍚悗鎸佷箙鍖栥€傚畬鏁村懡浠よ [HOST_ACCEPTANCE.md](HOST_ACCEPTANCE.md)銆?

