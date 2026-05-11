#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

case "${LC_ALL:-${LANG:-}}" in
  *.UTF-8|*.utf8) ;;
  *) export LC_ALL=C.UTF-8 ;;
esac

NODE_BIN="${NODE_BIN:-node}"
WALLET_JS="$APP_DIR/evm-wallet.js"

banner() {
  local lines=(
'███████╗██╗   ██╗███╗   ███╗     ██████╗ ███████╗███╗   ██╗███████╗██████╗  █████╗ ████████╗ ██████╗ ██████╗ '
'██╔════╝██║   ██║████╗ ████║    ██╔════╝ ██╔════╝████╗  ██║██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔═══██╗██╔══██╗'
'█████╗  ██║   ██║██╔████╔██║    ██║  ███╗█████╗  ██╔██╗ ██║█████╗  ██████╔╝███████║   ██║   ██║   ██║██████╔╝'
'██╔══╝  ╚██╗ ██╔╝██║╚██╔╝██║    ██║   ██║██╔══╝  ██║╚██╗██║██╔══╝  ██╔══██╗██╔══██║   ██║   ██║   ██║██╔══██╗'
'███████╗ ╚████╔╝ ██║ ╚═╝ ██║    ╚██████╔╝███████╗██║ ╚████║███████╗██║  ██║██║  ██║   ██║   ╚██████╔╝██║  ██║'
'╚══════╝  ╚═══╝  ╚═╝     ╚═╝     ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝'
  )
  local cols color line len i ch t s r g b maxw
  cols="${COLUMNS:-0}"
  if [ "$cols" -lt 1 ]; then
    cols="$(tput cols 2>/dev/null || echo 0)"
  fi
  if [ "$cols" -lt 1 ] && [ -t 1 ]; then
    cols="$(stty size 2>/dev/null | awk '{print $2}' || echo 0)"
  fi
  [ "$cols" -lt 1 ] && cols=110
  color=1
  [ -n "${NO_COLOR:-}" ] && color=0
  [ "${TERM:-}" = "dumb" ] && color=0

  if [ "$cols" -lt 110 ]; then
    if [ "$color" = "1" ]; then
      printf '\n  \033[1;38;2;255;208;0mEVM GENERATOR\033[0m\n'
      printf '  \033[2;38;2;255;208;0mWallet Toolkit · ethers v6\033[0m\n\n'
    else
      printf '\n  EVM GENERATOR\n  Wallet Toolkit · ethers v6\n\n'
    fi
    return
  fi

  if [ "$color" = "0" ]; then
    printf '\n'
    for line in "${lines[@]}"; do printf '  %s\n' "$line"; done
    printf '\n  Wallet Toolkit · ethers v6 · 24 commands\n\n'
    return
  fi

  maxw=0
  for line in "${lines[@]}"; do
    [ ${#line} -gt "$maxw" ] && maxw=${#line}
  done

  printf '\n'
  for line in "${lines[@]}"; do
    len=${#line}
    i=0
    printf '  '
    while [ "$i" -lt "$len" ]; do
      ch="${line:$i:1}"
      t=$(( i * 1000 / (maxw - 1) ))
      if [ "$t" -le 500 ]; then
        s=$(( t * 2 ))
        r=255
        g=$(( 232 + (208 - 232) * s / 1000 ))
        b=$(( 115 + (0 - 115) * s / 1000 ))
      else
        s=$(( (t - 500) * 2 ))
        r=255
        g=$(( 208 + (149 - 208) * s / 1000 ))
        b=0
      fi
      printf '\033[1;38;2;%d;%d;%dm%s' "$r" "$g" "$b" "$ch"
      i=$(( i + 1 ))
    done
    printf '\033[0m\n'
  done
  printf '  \033[2;38;2;255;208;0mWallet Toolkit · ethers v6 · 24 commands\033[0m\n\n'
}

# ── Menu rendering ──────────────────────────────────────────────────────────
_MENU_W=72
_MENU_DASHES='────────────────────────────────────────────────────────────────────────────────'
_MENU_COLOR=1
[ -n "${NO_COLOR:-}" ] && _MENU_COLOR=0
[ "${TERM:-}" = "dumb" ] && _MENU_COLOR=0

_menu_section_header() {
  local title="$1" r="$2" g="$3" b="$4" fill
  if [ -z "$title" ]; then
    fill=$((_MENU_W - 4))
    if [ "$_MENU_COLOR" = "1" ]; then
      printf '  \033[38;2;%d;%d;%dm╭%s╮\033[0m\n' "$r" "$g" "$b" "${_MENU_DASHES:0:$fill}"
    else
      printf '  ╭%s╮\n' "${_MENU_DASHES:0:$fill}"
    fi
    return
  fi
  fill=$((_MENU_W - 7 - ${#title}))
  if [ "$_MENU_COLOR" = "1" ]; then
    printf '  \033[1;38;2;%d;%d;%dm╭─ %s \033[0m' "$r" "$g" "$b" "$title"
    printf '\033[38;2;%d;%d;%dm%s╮\033[0m\n' "$r" "$g" "$b" "${_MENU_DASHES:0:$fill}"
  else
    printf '  ╭─ %s %s╮\n' "$title" "${_MENU_DASHES:0:$fill}"
  fi
}

_menu_section_footer() {
  local r="$1" g="$2" b="$3"
  local fill=$((_MENU_W - 4))
  if [ "$_MENU_COLOR" = "1" ]; then
    printf '  \033[38;2;%d;%d;%dm╰%s╯\033[0m\n' "$r" "$g" "$b" "${_MENU_DASHES:0:$fill}"
  else
    printf '  ╰%s╯\n' "${_MENU_DASHES:0:$fill}"
  fi
}

_menu_opt() {
  local num="$1" title="$2" desc="$3"
  local r="$4" g="$5" b="$6"
  if [ "$_MENU_COLOR" = "1" ]; then
    printf '  \033[38;2;%d;%d;%dm│\033[0m  ' "$r" "$g" "$b"
    printf '\033[1;38;2;255;208;0m%2s\033[0m    ' "$num"
    printf '\033[1m%-22s\033[0m' "$title"
    printf '\033[2m%-36s\033[0m' "$desc"
    printf '  \033[38;2;%d;%d;%dm│\033[0m\n' "$r" "$g" "$b"
  else
    printf '  │  %2s    %-22s%-36s  │\n' "$num" "$title" "$desc"
  fi
}

_menu_render() {
  printf '\n'

  # Wallet — light gold #FFE066
  _menu_section_header "Wallet" 255 224 102
  _menu_opt  1 "Generate wallet"     "random / HD / vanity"            255 224 102
  _menu_opt  2 "Export keystore"     "encrypt PK to JSON v3"           255 224 102
  _menu_opt  3 "Import keystore"     "decrypt keystore JSON"           255 224 102
  _menu_opt  4 "Batch keystore"      "CSV to folder of JSONs"          255 224 102
  _menu_section_footer                                                 255 224 102

  # Send (single wallet) — base #FFD000
  _menu_section_header "Send (1 wallet)" 255 208 0
  _menu_opt  5 "Send native"         "ETH / BNB / POL / etc."          255 208 0
  _menu_opt  6 "Send ERC20"          "by contract address"             255 208 0
  _menu_opt  7 "Sweep native"        "all balance, auto-gas"           255 208 0
  _menu_opt  8 "Sweep token"         "all balance ERC20"               255 208 0
  _menu_opt  9 "Approve ERC20"       "allowance to spender"            255 208 0
  _menu_opt 10 "Disperse"            "1 wallet -> many recipients"     255 208 0
  _menu_opt 11 "Speed-up / cancel"   "replace pending tx (or cancel)"  255 208 0
  _menu_section_footer                                                 255 208 0

  # Batch (many wallets) — mid amber #FFB400
  _menu_section_header "Batch (many wallets)" 255 180 0
  _menu_opt 12 "Batch send"          "many wallets -> 1 recipient"     255 180 0
  _menu_opt 13 "Consolidate"         "many wallets -> 1 (full sweep)"  255 180 0
  _menu_opt 14 "Balance batch"       "native + ERC20 from CSV"         255 180 0
  _menu_section_footer                                                 255 180 0

  # Inspect / read — deep amber #FF9500
  _menu_section_header "Inspect / Read" 255 149 0
  _menu_opt 15 "Balance"             "1 or N addresses + tokens"       255 149 0
  _menu_opt 16 "Token info"          "ERC20 metadata"                  255 149 0
  _menu_opt 17 "Tx status"           "by hash"                         255 149 0
  _menu_opt 18 "Gas now"             "current gas / fee data"          255 149 0
  _menu_opt 19 "ENS lookup"          "name <-> address"                255 149 0
  _menu_opt 20 "Nonce"               "pending vs confirmed"            255 149 0
  _menu_opt 21 "Sign message"        "EIP-191"                         255 149 0
  _menu_opt 22 "Verify message"      "EIP-191"                         255 149 0
  _menu_opt 23 "List chains"         "preset chain list"               255 149 0
  _menu_section_footer                                                 255 149 0

  # Exit — dim gray
  _menu_section_header ""                                              140 140 140
  _menu_opt  0 "Exit / quit"         "type 0 or q"                     140 140 140
  _menu_section_footer                                                 140 140 140

  printf '\n'
}

_menu_pause() {
  printf '\n'
  if [ "$_MENU_COLOR" = "1" ]; then
    read -r -p $'  \033[2m[Press Enter to go back to the menu]\033[0m ' _ || true
  else
    read -r -p '  [Press Enter to go back to the menu] ' _ || true
  fi
}

_menu_invalid() {
  if [ "$_MENU_COLOR" = "1" ]; then
    printf '\n  \033[1;38;2;229;69;57m✗ Invalid option: %s\033[0m\n' "$1"
  else
    printf '\n  Invalid option: %s\n' "$1"
  fi
  sleep 1
}

need_deps() {
  if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
    echo "ERROR: node is not installed." >&2
    exit 1
  fi
  if [ ! -d node_modules ]; then
    echo "Installing dependencies..."
    npm install
  fi
}

ask() {
  local prompt="$1"
  local default="${2:-}"
  local value
  if [ -n "$default" ]; then
    read -r -p "$prompt [$default]: " value
    echo "${value:-$default}"
  else
    read -r -p "$prompt: " value
    echo "$value"
  fi
}

ask_secret() {
  local prompt="$1"
  local value
  read -r -s -p "$prompt: " value
  echo >&2
  echo "$value"
}

confirm() {
  local prompt="${1:-Continue? type YES}"
  read -r -p "$prompt: " ok
  [ "$ok" = "YES" ] || { echo "Cancelled."; return 1; }
}

ask_chain() {
  _CHAIN_ARGS=()
  echo "Chain presets: ethereum, base, bsc, polygon, arbitrum, optimism, avalanche, linea, scroll, zksync, sepolia, base-sepolia" >&2
  echo "Or type 'rpc' to enter a custom RPC URL." >&2
  local pick
  pick="$(ask "Pick chain" "base")"
  if [ "$pick" = "rpc" ]; then
    local rpc
    rpc="$(ask "RPC URL")"
    _CHAIN_ARGS=(--rpc "$rpc")
  else
    _CHAIN_ARGS=(--chain "$pick")
  fi
}

ask_pk_source() {
  _PK_ARGS=()
  echo "Private key source:" >&2
  echo "  1) hidden prompt (default)" >&2
  echo "  2) file (--pk-file)" >&2
  echo "  3) env var (--pk-env)" >&2
  echo "  4) keystore JSON (--keystore)" >&2
  local src
  src="$(ask "Pick source" "1")"
  case "$src" in
    1)
      local pk
      pk="$(ask_secret "Sender private key")"
      _PK_ARGS=(--pk "$pk")
      ;;
    2)
      local f
      f="$(ask "PK file path")"
      _PK_ARGS=(--pk-file "$f")
      ;;
    3)
      local n
      n="$(ask "Env var name (e.g. EVM_PK)")"
      _PK_ARGS=(--pk-env "$n")
      ;;
    4)
      local ks pw
      ks="$(ask "Keystore JSON path")"
      pw="$(ask_secret "Keystore password")"
      _PK_ARGS=(--keystore "$ks" --password "$pw")
      ;;
    *)
      echo "Invalid choice" >&2
      exit 1
      ;;
  esac
}

ask_gas() {
  _GAS_ARGS=()
  local mode
  echo "Gas mode:" >&2
  echo "  1) auto (default, uses provider feeData)" >&2
  echo "  2) EIP-1559 manual (--max-fee + --priority-fee)" >&2
  echo "  3) legacy --gas-price" >&2
  echo "  4) skip (let ethers handle it)" >&2
  mode="$(ask "Pick gas mode" "1")"
  case "$mode" in
    1)
      local mult
      mult="$(ask "Gas multiplier" "1.0")"
      _GAS_ARGS=(--auto-gas --gas-multiplier "$mult")
      ;;
    2)
      local mf pf
      mf="$(ask "maxFeePerGas (gwei)")"
      pf="$(ask "maxPriorityFeePerGas (gwei)")"
      _GAS_ARGS=(--max-fee "$mf" --priority-fee "$pf")
      ;;
    3)
      local gp
      gp="$(ask "gasPrice (gwei)")"
      _GAS_ARGS=(--gas-price "$gp")
      ;;
    4) ;;
    *) ;;
  esac
}

run_node() {
  echo
  # Print command with sensitive arg values redacted
  local _print=() _redact_next=0 _a
  for _a in "$@"; do
    if [ "$_redact_next" = "1" ]; then
      _redact_next=0
      _print+=("[redacted]")
      continue
    fi
    case "$_a" in
      --pk|--password) _redact_next=1; _print+=("$_a") ;;
      *) _print+=("$_a") ;;
    esac
  done
  echo "+ $NODE_BIN $WALLET_JS ${_print[*]}"
  echo
  "$NODE_BIN" "$WALLET_JS" "$@"
}

cmd_chains() {
  need_deps
  run_node chains
}

cmd_gas_now() {
  need_deps
  ask_chain
  run_node gas-now "${_CHAIN_ARGS[@]}"
}

cmd_balance() {
  need_deps
  ask_chain
  local mode tokens tok_args=()
  echo "1) single address  2) many addresses (CSV)  3) many addresses (comma list)"
  mode="$(ask "Pick" "1")"
  tokens="$(ask "Token contract addresses (comma-separated, blank for native only)")"
  [ -n "$tokens" ] && tok_args=(--tokens "$tokens")
  case "$mode" in
    1)
      local a
      a="$(ask "Address or ENS")"
      run_node balance "${_CHAIN_ARGS[@]}" --address "$a" "${tok_args[@]}"
      ;;
    2)
      local f
      f="$(ask "CSV path (column: address)")"
      run_node balance "${_CHAIN_ARGS[@]}" --csv "$f" "${tok_args[@]}"
      ;;
    3)
      local lst
      lst="$(ask "Addresses comma-separated")"
      run_node balance "${_CHAIN_ARGS[@]}" --addresses "$lst" "${tok_args[@]}"
      ;;
  esac
}

cmd_token_info() {
  need_deps
  ask_chain
  local t
  t="$(ask "Token contract address")"
  run_node token-info "${_CHAIN_ARGS[@]}" --token "$t"
}

cmd_tx_status() {
  need_deps
  ask_chain
  local h
  h="$(ask "Tx hash")"
  run_node tx-status "${_CHAIN_ARGS[@]}" --tx "$h"
}

cmd_ens() {
  need_deps
  ask_chain
  local mode
  echo "1) ENS name -> address   2) address -> ENS name"
  mode="$(ask "Pick" "1")"
  if [ "$mode" = "1" ]; then
    local n
    n="$(ask "ENS name (e.g. vitalik.eth)")"
    run_node ens "${_CHAIN_ARGS[@]}" --name "$n"
  else
    local a
    a="$(ask "Address")"
    run_node ens "${_CHAIN_ARGS[@]}" --address "$a"
  fi
}

cmd_nonce() {
  need_deps
  ask_chain
  local a
  a="$(ask "Address")"
  run_node nonce "${_CHAIN_ARGS[@]}" --address "$a"
}

cmd_generate() {
  need_deps
  local count out fmt mode
  echo "Generate mode:"
  echo "  1) N random wallets (each with its own mnemonic)"
  echo "  2) HD wallets from one mnemonic + derivation path"
  echo "  3) vanity (custom prefix/suffix)"
  mode="$(ask "Pick" "1")"
  count="$(ask "Number of wallets" "1")"
  out="$(ask "Output file" "wallets-$(date +%Y%m%d-%H%M%S).csv")"
  fmt="$(ask "Format: csv/json" "csv")"
  local json_flags=()
  [ "$fmt" = "json" ] && json_flags=(--json)

  case "$mode" in
    1)
      local save_m mnemonic_flags=()
      read -r -p "Save mnemonic? (y/n) [y]: " save_m
      [[ "${save_m:-y}" =~ ^[Nn]$ ]] && mnemonic_flags=(--no-mnemonic)
      run_node generate --count "$count" --out "$out" "${json_flags[@]}" "${mnemonic_flags[@]}"
      ;;
    2)
      local mode_m phrase_args=() path_base mnemonic_out mn_args=()
      echo "  a) auto-generate a new mnemonic"
      echo "  b) enter an existing mnemonic"
      echo "  c) read from file"
      mode_m="$(ask "Pick" "a")"
      if [ "$mode_m" = "b" ]; then
        local m
        m="$(ask_secret "Mnemonic phrase")"
        phrase_args=(--mnemonic "$m")
      elif [ "$mode_m" = "c" ]; then
        local f
        f="$(ask "Mnemonic file path")"
        phrase_args=(--mnemonic-file "$f")
      fi
      path_base="$(ask "Derivation path base" "m/44'/60'/0'/0")"
      mnemonic_out="$(ask "Save master mnemonic to file (blank = print to stderr)" "")"
      [ -n "$mnemonic_out" ] && mn_args=(--mnemonic-out "$mnemonic_out")
      run_node generate-hd --count "$count" --out "$out" --path-base "$path_base" "${json_flags[@]}" "${phrase_args[@]}" "${mn_args[@]}"
      ;;
    3)
      local prefix suffix cs_flags=() px_args=() sx_args=()
      prefix="$(ask "Hex prefix (e.g. dead, blank to skip)" "")"
      suffix="$(ask "Hex suffix (e.g. cafe, blank to skip)" "")"
      read -r -p "Case-sensitive (checksum)? (y/n) [n]: " cs
      [[ "${cs:-n}" =~ ^[Yy]$ ]] && cs_flags=(--checksum)
      [ -n "$prefix" ] && px_args=(--prefix "$prefix")
      [ -n "$suffix" ] && sx_args=(--suffix "$suffix")
      run_node vanity "${px_args[@]}" "${sx_args[@]}" --count "$count" --out "$out" "${json_flags[@]}" "${cs_flags[@]}"
      ;;
  esac
  chmod 600 "$out" 2>/dev/null || true
  echo "Done. File permission set to 600: $out"
}

cmd_keystore_export() {
  need_deps
  local pk pw out scrypt
  pk="$(ask_secret "Private key")"
  pw="$(ask_secret "Keystore password")"
  out="$(ask "Output keystore JSON" "keystore-$(date +%Y%m%d-%H%M%S).json")"
  scrypt="$(ask "scrypt N (higher = more secure but slower)" "131072")"
  run_node keystore-export --pk "$pk" --password "$pw" --scrypt-n "$scrypt" --out "$out"
  # Note: run_node redacts --pk and --password values in the printed command
}

cmd_keystore_import() {
  need_deps
  local f reveal_flags=()
  f="$(ask "Keystore path")"
  read -r -p "Reveal private key in output? (y/n) [n]: " r
  [[ "${r:-n}" =~ ^[Yy]$ ]] && reveal_flags=(--reveal)
  local pw
  pw="$(ask_secret "Keystore password")"
  run_node keystore-import --keystore "$f" --password "$pw" "${reveal_flags[@]}"
}

cmd_keystore_batch() {
  need_deps
  local csv outdir pw scrypt
  csv="$(ask "CSV with column private_key")"
  outdir="$(ask "Output folder" "./keystores")"
  pw="$(ask_secret "Password (used for all wallets)")"
  scrypt="$(ask "scrypt N" "32768")"
  run_node keystore-batch --csv "$csv" --out-dir "$outdir" --password "$pw" --scrypt-n "$scrypt"
}

cmd_send_native() {
  need_deps
  ask_chain
  ask_pk_source
  local to amount dry_flags=() wait_flags=()
  to="$(ask "Recipient (address or ENS)")"
  amount="$(ask "Amount (e.g. 0.001)")"
  ask_gas
  read -r -p "Dry run first? (y/n) [y]: " d
  [[ "${d:-y}" =~ ^[Yy]$ ]] && dry_flags=(--dry-run)
  if [ "${#dry_flags[@]}" -eq 0 ]; then
    confirm "Continue broadcast? type YES" || return 0
  fi
  read -r -p "Wait for confirmation? (y/n) [y]: " w
  [[ "${w:-y}" =~ ^[Nn]$ ]] || wait_flags=(--wait)
  run_node send-native "${_CHAIN_ARGS[@]}" "${_PK_ARGS[@]}" --to "$to" --amount "$amount" "${_GAS_ARGS[@]}" "${wait_flags[@]}" "${dry_flags[@]}"
}

cmd_send_token() {
  need_deps
  ask_chain
  ask_pk_source
  local to amount token decimals dec_args=() dry_flags=() wait_flags=()
  token="$(ask "Token contract address")"
  to="$(ask "Recipient (address or ENS)")"
  amount="$(ask "Amount (e.g. 10.5)")"
  decimals="$(ask "Decimals (blank = auto)")"
  ask_gas
  [ -n "$decimals" ] && dec_args=(--decimals "$decimals")
  read -r -p "Dry run first? (y/n) [y]: " d
  [[ "${d:-y}" =~ ^[Yy]$ ]] && dry_flags=(--dry-run)
  if [ "${#dry_flags[@]}" -eq 0 ]; then
    confirm "Continue broadcast? type YES" || return 0
  fi
  read -r -p "Wait for confirmation? (y/n) [y]: " w
  [[ "${w:-y}" =~ ^[Nn]$ ]] || wait_flags=(--wait)
  run_node send-token "${_CHAIN_ARGS[@]}" "${_PK_ARGS[@]}" --token "$token" --to "$to" --amount "$amount" "${dec_args[@]}" "${_GAS_ARGS[@]}" "${wait_flags[@]}" "${dry_flags[@]}"
}

cmd_sweep_native() {
  need_deps
  ask_chain
  ask_pk_source
  local to leave leave_args=() wait_flags=()
  to="$(ask "Recipient")"
  leave="$(ask "Leave how much native behind? (blank = 0)" "")"
  ask_gas
  [ -n "$leave" ] && leave_args=(--leave "$leave")
  confirm "Sweep ALL native from wallet to $to. type YES" || return 0
  read -r -p "Wait for confirmation? (y/n) [y]: " w
  [[ "${w:-y}" =~ ^[Nn]$ ]] || wait_flags=(--wait)
  run_node sweep-native "${_CHAIN_ARGS[@]}" "${_PK_ARGS[@]}" --to "$to" "${leave_args[@]}" "${_GAS_ARGS[@]}" "${wait_flags[@]}"
}

cmd_sweep_token() {
  need_deps
  ask_chain
  ask_pk_source
  local to token decimals dec_args=() wait_flags=()
  token="$(ask "Token contract address")"
  to="$(ask "Recipient")"
  decimals="$(ask "Decimals (blank = auto)")"
  ask_gas
  [ -n "$decimals" ] && dec_args=(--decimals "$decimals")
  confirm "Sweep ALL tokens from wallet to $to. type YES" || return 0
  read -r -p "Wait for confirmation? (y/n) [y]: " w
  [[ "${w:-y}" =~ ^[Nn]$ ]] || wait_flags=(--wait)
  run_node sweep-token "${_CHAIN_ARGS[@]}" "${_PK_ARGS[@]}" --token "$token" --to "$to" "${dec_args[@]}" "${_GAS_ARGS[@]}" "${wait_flags[@]}"
}

cmd_approve() {
  need_deps
  ask_chain
  ask_pk_source
  local token spender amount max_flags=() amt_args=()
  token="$(ask "Token contract address")"
  spender="$(ask "Spender (router/contract address)")"
  read -r -p "Approve max (infinite)? (y/n) [n]: " m
  if [[ "${m:-n}" =~ ^[Yy]$ ]]; then
    max_flags=(--max)
  else
    amount="$(ask "Amount")"
    [ -n "$amount" ] && amt_args=(--amount "$amount")
  fi
  ask_gas
  confirm "Approve $spender. type YES" || return 0
  run_node approve "${_CHAIN_ARGS[@]}" "${_PK_ARGS[@]}" --token "$token" --spender "$spender" "${amt_args[@]}" "${max_flags[@]}" "${_GAS_ARGS[@]}" --wait
}

cmd_disperse() {
  need_deps
  ask_chain
  ask_pk_source
  local csv type token decimals tk_args=() dec_args=() dry_flags=()
  csv="$(ask "CSV (columns: address,amount)")"
  type="$(ask "Type: native/token" "native")"
  token=""
  decimals=""
  if [ "$type" = "token" ]; then
    token="$(ask "Token contract address")"
    decimals="$(ask "Decimals (blank = auto)")"
  fi
  ask_gas
  [ -n "$token" ] && tk_args=(--token "$token")
  [ -n "$decimals" ] && dec_args=(--decimals "$decimals")
  read -r -p "Dry run first? (y/n) [y]: " d
  [[ "${d:-y}" =~ ^[Yy]$ ]] && dry_flags=(--dry-run)
  if [ "${#dry_flags[@]}" -eq 0 ]; then
    confirm "Continue disperse? type YES" || return 0
  fi
  run_node disperse "${_CHAIN_ARGS[@]}" "${_PK_ARGS[@]}" --csv "$csv" --type "$type" "${tk_args[@]}" "${dec_args[@]}" "${_GAS_ARGS[@]}" --wait "${dry_flags[@]}"
}

cmd_speedup() {
  need_deps
  ask_chain
  ask_pk_source
  local tx mode mult cancel_flags=()
  tx="$(ask "Tx hash to speed up or cancel")"
  echo "1) speed-up   2) cancel"
  mode="$(ask "Pick" "1")"
  [ "$mode" = "2" ] && cancel_flags=(--cancel)
  mult="$(ask "Gas multiplier" "1.2")"
  ask_gas
  confirm "Continue $([ "${#cancel_flags[@]}" -gt 0 ] && echo cancel || echo speed-up)? type YES" || return 0
  run_node speedup "${_CHAIN_ARGS[@]}" "${_PK_ARGS[@]}" --tx "$tx" --gas-multiplier "$mult" "${_GAS_ARGS[@]}" "${cancel_flags[@]}" --wait
}

cmd_batch_send() {
  need_deps
  ask_chain
  local csv type to amount token decimals concurrency retries log tk_args=() dec_args=() log_args=() dry_flags=()
  csv="$(ask "CSV (column: private_key)")"
  type="$(ask "Type: native/token" "native")"
  to="$(ask "Recipient (same for all wallets)")"
  amount="$(ask "Amount per wallet")"
  token=""
  decimals=""
  if [ "$type" = "token" ]; then
    token="$(ask "Token contract address")"
    decimals="$(ask "Decimals (blank = auto)")"
  fi
  concurrency="$(ask "Concurrency" "1")"
  retries="$(ask "Retries on fail" "0")"
  log="$(ask "Log file path (blank to skip)" "")"
  ask_gas
  [ -n "$token" ] && tk_args=(--token "$token")
  [ -n "$decimals" ] && dec_args=(--decimals "$decimals")
  [ -n "$log" ] && log_args=(--log "$log")
  read -r -p "Dry run first? (y/n) [y]: " d
  [[ "${d:-y}" =~ ^[Yy]$ ]] && dry_flags=(--dry-run)
  if [ "${#dry_flags[@]}" -eq 0 ]; then
    confirm "Continue batch broadcast? type YES" || return 0
  fi
  run_node batch-send --csv "$csv" "${_CHAIN_ARGS[@]}" --type "$type" --to "$to" --amount "$amount" --concurrency "$concurrency" --retries "$retries" "${tk_args[@]}" "${dec_args[@]}" "${log_args[@]}" "${_GAS_ARGS[@]}" --wait "${dry_flags[@]}"
}

cmd_consolidate() {
  need_deps
  ask_chain
  local csv type to leave token decimals concurrency retries log min_send
  local tk_args=() dec_args=() log_args=() leave_args=() min_args=() dry_flags=()
  csv="$(ask "CSV (column: private_key)")"
  type="$(ask "Type: native/token" "native")"
  to="$(ask "Collector address")"
  token=""
  decimals=""
  if [ "$type" = "token" ]; then
    token="$(ask "Token contract address")"
    decimals="$(ask "Decimals (blank = auto)")"
  fi
  leave="$(ask "(native) how much to leave in each wallet (blank = 0)" "")"
  min_send="$(ask "Skip if balance is below this amount (blank = no min)" "")"
  concurrency="$(ask "Concurrency" "1")"
  retries="$(ask "Retries on fail" "0")"
  log="$(ask "Log file path (blank to skip)" "")"
  ask_gas
  [ -n "$token" ] && tk_args=(--token "$token")
  [ -n "$decimals" ] && dec_args=(--decimals "$decimals")
  [ -n "$log" ] && log_args=(--log "$log")
  [ -n "$leave" ] && leave_args=(--leave "$leave")
  [ -n "$min_send" ] && min_args=(--min-send "$min_send")
  read -r -p "Dry run first? (y/n) [y]: " d
  [[ "${d:-y}" =~ ^[Yy]$ ]] && dry_flags=(--dry-run)
  if [ "${#dry_flags[@]}" -eq 0 ]; then
    confirm "Continue consolidate sweep to $to? type YES" || return 0
  fi
  run_node consolidate --csv "$csv" "${_CHAIN_ARGS[@]}" --type "$type" --to "$to" --concurrency "$concurrency" --retries "$retries" "${tk_args[@]}" "${dec_args[@]}" "${log_args[@]}" "${leave_args[@]}" "${min_args[@]}" "${_GAS_ARGS[@]}" --wait "${dry_flags[@]}"
}

cmd_balance_batch() {
  need_deps
  ask_chain
  local csv tokens out tok_args=() out_args=()
  csv="$(ask "CSV (column: private_key)")"
  tokens="$(ask "Token addresses (comma-separated, blank for native only)")"
  out="$(ask "Output CSV path (blank for stdout)" "")"
  [ -n "$tokens" ] && tok_args=(--tokens "$tokens")
  [ -n "$out" ] && out_args=(--out "$out")
  run_node balance-batch --csv "$csv" "${_CHAIN_ARGS[@]}" "${tok_args[@]}" "${out_args[@]}"
}

cmd_sign_message() {
  need_deps
  ask_pk_source
  local msg
  msg="$(ask "Message")"
  run_node sign-message "${_PK_ARGS[@]}" --message "$msg"
}

cmd_verify_message() {
  need_deps
  local msg sig addr addr_args=()
  msg="$(ask "Message")"
  sig="$(ask "Signature")"
  addr="$(ask "Expected address (blank to skip match check)" "")"
  [ -n "$addr" ] && addr_args=(--address "$addr")
  run_node verify-message --message "$msg" --signature "$sig" "${addr_args[@]}"
}

usage() {
  cat <<'USAGE'
EVM Wallet Toolkit (interactive)

Usage:
  ./start.sh                Open the interactive menu
  ./start.sh <subcommand>   Run a subcommand directly

Subcommands:
  generate         Generate wallets (random/HD/vanity)
  keystore-export  Export PK to an encrypted keystore
  keystore-import  Decrypt a keystore
  keystore-batch   Convert CSV to a folder of keystores
  send-native      Send native token
  send-token       Send ERC20 token
  sweep-native     Sweep all native balance to one address
  sweep-token      Sweep all ERC20 balance to one address
  approve          ERC20 approve a spender
  disperse         One wallet -> many recipients (CSV)
  speedup          Speed-up / cancel a pending tx
  batch-send       Many wallets -> one recipient (CSV)
  consolidate      Many wallets -> one collector (sweep)
  balance          Check balance for one or many addresses
  balance-batch    Check balance from a CSV of wallets
  token-info       ERC20 contract info
  tx-status        Transaction status by hash
  gas-now          Current gas price on the chain
  ens              ENS name lookup
  nonce            Check nonce for an address
  sign-message     Sign an EIP-191 message
  verify-message   Verify an EIP-191 signature
  chains           List preset chains
  help             Show this help

Run "node evm-wallet.js help" for all CLI flags.
USAGE
}

main_menu() {
  banner
  local choice prompt_str
  if [ "$_MENU_COLOR" = "1" ]; then
    prompt_str=$'  \033[1;38;2;255;208;0m▸\033[0m  Pick an option: '
  else
    prompt_str='  > Pick an option: '
  fi
  while true; do
    _menu_render
    read -r -p "$prompt_str" choice || exit 0
    case "$choice" in
       1) cmd_generate ;;
       2) cmd_keystore_export ;;
       3) cmd_keystore_import ;;
       4) cmd_keystore_batch ;;
       5) cmd_send_native ;;
       6) cmd_send_token ;;
       7) cmd_sweep_native ;;
       8) cmd_sweep_token ;;
       9) cmd_approve ;;
      10) cmd_disperse ;;
      11) cmd_speedup ;;
      12) cmd_batch_send ;;
      13) cmd_consolidate ;;
      14) cmd_balance_batch ;;
      15) cmd_balance ;;
      16) cmd_token_info ;;
      17) cmd_tx_status ;;
      18) cmd_gas_now ;;
      19) cmd_ens ;;
      20) cmd_nonce ;;
      21) cmd_sign_message ;;
      22) cmd_verify_message ;;
      23) cmd_chains ;;
      0|q|Q|exit|quit) exit 0 ;;
      h|H|help|'?') usage ;;
      '') continue ;;
      *) _menu_invalid "$choice"; continue ;;
    esac
    _menu_pause
  done
}

case "${1:-menu}" in
  menu) main_menu ;;
  generate) cmd_generate ;;
  keystore-export) cmd_keystore_export ;;
  keystore-import) cmd_keystore_import ;;
  keystore-batch) cmd_keystore_batch ;;
  send-native) cmd_send_native ;;
  send-token) cmd_send_token ;;
  sweep-native) cmd_sweep_native ;;
  sweep-token) cmd_sweep_token ;;
  approve) cmd_approve ;;
  disperse) cmd_disperse ;;
  speedup) cmd_speedup ;;
  batch-send) cmd_batch_send ;;
  consolidate) cmd_consolidate ;;
  balance) cmd_balance ;;
  balance-batch) cmd_balance_batch ;;
  token-info) cmd_token_info ;;
  tx-status) cmd_tx_status ;;
  gas-now) cmd_gas_now ;;
  ens) cmd_ens ;;
  nonce) cmd_nonce ;;
  sign-message) cmd_sign_message ;;
  verify-message) cmd_verify_message ;;
  chains) cmd_chains ;;
  help|-h|--help) usage ;;
  *) usage; exit 1 ;;
esac
