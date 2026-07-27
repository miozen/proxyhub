# ProxyHub

ProxyHub 鏄儴缃插湪 VPS 鎴栧唴缃戣櫄鎷熸満涓婄殑 sing-box 閰嶇疆涓?Sub-Store
缁熶竴绠＄悊骞冲彴銆侾roxyHub 璐熻矗鐢ㄦ埛銆佹ā鏉垮拰 sing-box 閰嶇疆缁勮锛涜妭鐐硅闃呫€?
杞崲銆佸悓姝ュ強鍏跺浠芥仮澶嶇户缁娇鐢?Sub-Store 鍘熺敓鑳藉姏銆?

褰撳墠绋冲畾鐗堟湰锛歚v0.1.5`

## 鍔熻兘

- Node.js 22銆丼QLite銆丏ocker Compose銆?
- 鏀寔 Alpine銆丏ebian銆乁buntu锛屼互鍙?`amd64`銆乣arm64`銆?
- 瀹夸富鏈洪粯璁ゅ彧寮€鏀?`3000`锛汼ub-Store 涓嶆槧灏勫涓绘満绔彛銆?
- ProxyHub 涓?Sub-Store 浣跨敤鐙珛瀹瑰櫒锛屽彲鍒嗗埆鍚仠銆佹洿鏂板拰鍥炴粴銆?
- 棣栦綅娉ㄥ唽鐢ㄦ埛鑷姩鎴愪负 owner锛涘悗缁敞鍐岄渶瑕?owner 瀹℃牳銆?
- 鐢ㄦ埛銆佹敞鍐屽紑鍏炽€侀厤缃敓鎴愭潈闄愩€佺敤鎴峰悕銆佸瘑鐮佸拰瀹㈡埛绔?Token 绠＄悊銆?
- 鐢ㄦ埛璁㈤槄婧愬惎鍋溿€佸尯鍩熸巿鏉冦€佸崟婧愭祴璇曞拰鐢熸垚杩囩▼璇婃柇銆?
- 鍖哄煙鍖归厤銆佽妭鐐规竻娲椼€佹満鍦?脳 鍖哄煙鍒嗙粍銆佺瓥鐣ユ敞鍏ュ強 sing-box JSON 鐢熸垚銆?
- 涓嶄娇鐢ㄥ崗璁櫧鍚嶅崟锛屼繚鐣?Sub-Store 杈撳嚭鐨?AnyTLS 鍙婃湭鏉ュ崗璁瓧娈点€?
- 鏈湴/杩滅▼妯℃澘銆佹牎楠屻€佺紦瀛樸€佷笉鍙彉鐗堟湰銆佹縺娲诲拰鍥炴粴銆?
- 鐢熸垚澶辫触鏃跺彲杩斿洖鏈€杩戞垚鍔熼厤缃紝骞惰缃?`X-ProxyHub-Cache: stale`銆?
- owner 鍙繘鍏?Sub-Store 瀹樻柟鍓嶇锛涘悗绔娇鐢ㄥ彲閲嶇疆闅忔満璺緞銆?
- 瀹屾暣澶囦唤鎭㈠銆佷竴閿畨瑁呫€佸共鍑€瑕嗙洊瀹夎鍜屽交搴曞嵏杞姐€?
- 涓や釜缁勪欢鍧囨敮鎸佺ǔ瀹氱増妫€鏌ャ€乨igest 鍥哄畾銆佺嫭绔嬫洿鏂板拰澶辫触鍥炴粴銆?

## 閮ㄧ讲缁撴瀯

```text
娴忚鍣?/ sing-box 瀹㈡埛绔?
            |
       瀹夸富鏈?3000
            |
      ProxyHub 瀹瑰櫒
            |
       Docker 绉佹湁缃戠粶
            |
      Sub-Store 瀹瑰櫒
```

ProxyHub 涓嶆寕杞?Docker Socket銆傚鍣ㄨ繍缁村彧鑳藉湪瀹夸富鏈烘墽琛?`proxyhub`
鍛戒护銆?

## 涓€閿畨瑁?

浣跨敤 root 韬唤鎵ц锛?

```sh
curl -fsSLo /tmp/proxyhub-install.sh \
  https://github.com/miozen/proxyhub/releases/latest/download/install.sh
chmod +x /tmp/proxyhub-install.sh
/tmp/proxyhub-install.sh
```

TTY 涓畨瑁呭櫒閲囩敤榛樿浼樺厛鐨勫崐浜や簰娴佺▼锛氭湭浼?`--port` 鏃惰闂鍙ｏ紙榛樿
`3000`锛夛紝瀹屾垚鍙妫€鏌ュ拰闀滃儚瑙ｆ瀽鍚庡睍绀烘渶缁堟憳瑕侊紝骞插噣瀹夎浠?`[Y/n]`
纭銆傚畠鍙闂鍙ｃ€佺己澶辩殑 Docker/Compose 鎴栧涓绘満宸ュ叿锛屼互鍙婃渶缁堢‘璁ゃ€?
瀹夎鍣ㄤ細鏍￠獙绯荤粺銆佹灦鏋勩€丷elease SHA256銆佺鐩樸€佺鍙ｅ拰闀滃儚鏋舵瀯銆?ProxyHub 浣跨敤褰撳墠绋冲畾 Release锛汼ub-Store 榛樿浠庡畼鏂?`xream/sub-store:latest` 鍙戠幇绋冲畾闀滃儚锛岀劧鍚庢妸涓や釜缁勪欢鐨勪笉鍙彉 digest
鍐欏叆閰嶇疆銆?
瀹夎瀹屾垚鍚庤闂?`http://鏈嶅姟鍣↖P:3000/`銆傞娆℃敞鍐岀敤鎴锋垚涓?owner銆?

甯哥敤瀹夎閫夐」锛?

```sh
# 鎸囧畾 ProxyHub 鐗堟湰锛堝彲鍐?0.1.4 鎴?v0.1.4锛?
/tmp/proxyhub-install.sh --version 0.1.4

# 鎸囧畾绔彛
/tmp/proxyhub-install.sh --port 3100

# 鏄庣‘鍥哄畾 Sub-Store 鐗堟湰
/tmp/proxyhub-install.sh --substore-version 2.36.21

# 闈炰氦浜?鑷姩鍖栵細浣跨敤榛樿鍊间笖缁濅笉绛夊緟杈撳叆
/tmp/proxyhub-install.sh --yes
```

闈?TTY 鎵ц涓嶄細璇诲彇杈撳叆銆傞渶瑕佺‘璁ょ殑骞插噣瀹夎鑻ユ湭浼?`--yes` 浼氶€€鍑哄苟鎻愮ず
閲嶆柊鎵ц锛涢粯璁ょ鍙ｈ鍗犵敤鏃朵細鎻愮ず浣跨敤
`--port <available-port> --yes`銆俆TY 涓彲鐩存帴閲嶆柊杈撳叆鍙敤绔彛銆傛渶缁堢‘璁?鍓嶄笉浼氬垱寤?ProxyHub 鐨勫彈绠＄洰褰曘€侀厤缃垨鏁版嵁鍗枫€?
瀹夎鍙帴鍙楀共鍑€涓绘満銆傛娴嬪埌鐜版湁 ProxyHub 鐘舵€佹椂浼氭嫆缁濊鐩栵紝搴斾娇鐢?
`proxyhub update`銆傝嫢纭疄闇€瑕佸垹闄ゅ叏閮ㄦ棫鏁版嵁骞堕噸鏂板畨瑁咃細

```sh
PROXYHUB_REPLACE_CONFIRM=DELETE \
  /tmp/proxyhub-install.sh --replace --yes
```

`--replace` 浼氭案涔呭垹闄?ProxyHub銆丼ub-Store銆佸唴閮ㄥ浠姐€侀厤缃€佸瘑閽ュ拰
Docker 鏁版嵁鍗凤紝鍐嶅垱寤哄叏鏂板疄渚嬶紱瀹冧笉鏄崌绾э紝涔熸病鏈夊洖婊氫繚璇併€?

瀹夎浣嶇疆锛?

```text
/opt/proxyhub
/etc/proxyhub/proxyhub.env
/var/lib/proxyhub
/var/log/proxyhub
/usr/local/bin/proxyhub
```

## 鏃ュ父缁存姢

```sh
# 鐘舵€?
proxyhub status
proxyhub status proxyhub
proxyhub status sub-store

# 鍚仠鍜岄噸鍚?
proxyhub start
proxyhub stop
proxyhub restart
proxyhub restart proxyhub
proxyhub restart sub-store

# 鏃ュ織
proxyhub logs
proxyhub logs proxyhub --tail=100
proxyhub logs sub-store -f

# 鍙鏌ユ洿鏂帮紝涓嶄慨鏀规湇鍔?
proxyhub check-updates
proxyhub check-updates proxyhub
proxyhub check-updates sub-store
```

涓や釜瀹瑰櫒鏃ュ織鍧囩敱 Docker 闄愬埗涓烘瘡浠?`5MB`銆佹渶澶?`3` 浠姐€傞厤缃敓鎴愯褰?
姣忕敤鎴蜂繚鐣欐渶杩?`10` 娆°€?

## 鐙珛鏇存柊涓庡洖婊?

```sh
# 鏇存柊鍒版渶鏂扮ǔ瀹氱増
proxyhub update proxyhub
proxyhub update sub-store

# 鎸囧畾鐗堟湰
proxyhub update proxyhub --version 0.1.4
proxyhub update sub-store --version 2.36.21

# 鎸囧畾闀滃儚
proxyhub update proxyhub --image ghcr.io/miozen/proxyhub:v0.1.4
proxyhub update sub-store --image xream/sub-store:2.36.21

# 闈炰氦浜掔‘璁?
proxyhub update proxyhub --yes
proxyhub update sub-store --yes

# 鍥炴粴鏈€杩戜竴娆″搴旂粍浠剁殑鏇存柊
proxyhub rollback proxyhub
proxyhub rollback sub-store
```

鏇存柊鍓嶄細澶囦唤鎵€閫夌粍浠讹紝骞跺彧閲嶅缓璇ョ粍浠讹紱鍙︿竴涓鍣ㄤ繚鎸佷笉鍙樸€傚彂鐜扮洰鏍?
digest 涓庡綋鍓嶇浉鍚屼細鐩存帴鎴愬姛閫€鍑猴紝涓嶉噸鍚鍣ㄣ€傛瘡涓粍浠惰嚜鍔ㄤ繚鐣欐渶杩?
`5` 浠芥洿鏂板墠澶囦唤锛屾墜鍔ㄥ懡鍚嶇殑澶囦唤涓嶄細琚嚜鍔ㄦ竻鐞嗐€?

## 澶囦唤涓庢仮澶?

```sh
# 瀹屾暣澶囦唤涓や釜缁勪欢
proxyhub backup
proxyhub backup before-change

# 浠呭浠戒竴涓粍浠?proxyhub backup proxyhub before-proxyhub-change
proxyhub backup sub-store before-substore-change

# 瀹屾暣鎭㈠
proxyhub restore /var/lib/proxyhub/backups/full/before-change

# 鎭㈠鍗曠粍浠跺浠芥椂鍙噸寤哄搴旂粍浠?proxyhub restore \
  /var/lib/proxyhub/backups/components/sub-store/before-substore-change
```

鍐呴儴澶囦唤浣嶄簬 `/var/lib/proxyhub/backups/`銆傛柊澶囦唤鍖呭惈绫诲瀷銆佺粍浠跺拰
SHA256 鏍￠獙淇℃伅锛屾仮澶嶅墠浼氶獙璇併€傚畬鏁存仮澶嶄細瑕嗙洊褰撳墠涓や釜缁勪欢鐨勬暟鎹紱
缁勪欢鎭㈠鍙仠姝€佹仮澶嶅苟閲嶅缓瀵瑰簲缁勪欢銆備负浜嗛槻姝㈣矾寰勬浛鎹紝CLI 鍙仮澶?鍙楃澶囦唤鐩綍鍐呯殑澶囦唤銆傞渶瑕佽法鏈哄櫒鎭㈠鏃讹紝搴斿厛鎶婂浠藉畨鍏ㄥ鍒跺洖璇ョ洰褰曪紱
褰诲簳鍗歌浇浼氬垹闄ゅ唴閮ㄥ浠姐€?
Sub-Store 鍓嶇鑷韩鐨勫浠?鎭㈠浠嶄娇鐢?Sub-Store 鍘熺敓鏍煎紡鍜岄€昏緫銆?

## 褰诲簳鍗歌浇

`proxyhub uninstall` 鍙湁褰诲簳鍗歌浇涓€绉嶈涔夛紝涓嶆彁渚涗繚鐣欏彈绠℃暟鎹殑
鍗歌浇妯″紡锛?

```sh
# 浜や簰鎵ц锛屾寜鎻愮ず杈撳叆 DELETE
proxyhub uninstall

# 鑷姩鍖栨墽琛?
PROXYHUB_UNINSTALL_CONFIRM=DELETE proxyhub uninstall
```

瀹冧細鍒犻櫎涓や釜瀹瑰櫒銆佺鏈夌綉缁溿€佷袱涓暟鎹嵎銆侀厤缃€佸瘑閽ャ€佸唴閮ㄥ浠姐€佹棩蹇椼€?
閮ㄧ讲鐩綍鍜?CLI銆備笉浼氬嵏杞?Docker銆佸垹闄ゅ涓绘満杞欢鍖呫€佸閮ㄥ浠芥垨闀滃儚
缂撳瓨銆傞噸澶嶆墽琛屽嵏杞芥寜宸插垹闄ょ姸鎬佸鐞嗐€?

## 閰嶇疆銆佸仴搴峰拰瀹夊叏

涓婚厤缃枃浠讹細

```text
/etc/proxyhub/proxyhub.env
```

閫氳繃 HTTPS 鍙嶅悜浠ｇ悊鏃跺缓璁缃細

```env
COOKIE_SECURE=true
TRUST_PROXY=true
```

淇敼鍚庢墽琛?`proxyhub restart proxyhub`銆備笉瑕佸叕寮€鐜閰嶇疆銆佸鎴风
Token銆佽闃呭湴鍧€鎴栧浠芥枃浠躲€?

鍋ュ悍妫€鏌ワ細

```sh
curl -fsS http://127.0.0.1:3000/healthz
```

姝ｅ父缁撴灉鍖呭惈 `"status":"ok"`銆佹暟鎹簱姝ｅ父浠ュ強 Sub-Store
`"reachable":true`銆?

## 闀滃儚涓庢枃妗?

- 绋冲畾闀滃儚锛歚ghcr.io/miozen/proxyhub:v0.1.4`
- 鏈€鏂扮ǔ瀹氶暅鍍忥細`ghcr.io/miozen/proxyhub:latest`
- 骞冲彴锛歚linux/amd64`銆乣linux/arm64`
- Sub-Store锛歚xream/sub-store`
- [GitHub Releases](https://github.com/miozen/proxyhub/releases)
- [杩愮淮涓庢仮澶峕(OPERATIONS.md)
- [鐪熸満楠屾敹](HOST_ACCEPTANCE.md)
- [瀹夊叏璇存槑](SECURITY.md)
- [绋冲畾鐢熷懡鍛ㄦ湡璁捐](STABILITY_LIFECYCLE_DESIGN.md)
- [浜や簰寮忕敓鍛藉懆鏈熷崌绾ц璁(INTERACTIVE_LIFECYCLE_UPGRADE_DESIGN.md)
- [I2 鐢熷懡鍛ㄦ湡鍩虹楠屾敹璇佹嵁](I2_ACCEPTANCE_EVIDENCE.md)
- [I3 鍗婁氦浜掑畨瑁呴獙鏀惰瘉鎹甝(I3_ACCEPTANCE_EVIDENCE.md)

姝ｅ紡闀滃儚鍜屽畨瑁呰祫浜т粎鐢?`v*` 鏍囩瑙﹀彂鍙戝竷銆俙dev` 鍒嗘敮鐨勯暅鍍忓伐浣滄祦鍙?
鍏佽鎵嬪姩瑙﹀彂銆?

