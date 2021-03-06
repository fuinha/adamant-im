<template>
  <div>
    <v-menu>
      <v-icon medium class="chat-menu__icon" slot="activator">mdi-plus-circle-outline</v-icon>

      <v-list>
        <!-- Cryptos -->
        <v-list-tile
          v-for="c in cryptos"
          :key="c"
          @click="sendFunds(c)"
        >
          <v-list-tile-avatar>
            <crypto-icon :crypto="c" />
          </v-list-tile-avatar>

          <v-list-tile-title>{{ $t('chats.send_crypto', { crypto: c }) }}</v-list-tile-title>
        </v-list-tile>

        <!-- Actions -->
        <v-list-tile
          v-for="item in menuItems"
          :key="item.title"
          :disabled="item.disabled"
        >
          <v-list-tile-avatar>
            <v-icon>{{ item.icon }}</v-icon>
          </v-list-tile-avatar>

          <v-list-tile-title>{{ $t(item.title) }}</v-list-tile-title>
        </v-list-tile>

      </v-list>
    </v-menu>

    <ChatDialog
      v-model="dialog"
      :title="$t('transfer.no_address_title', { crypto })"
      :text="$t('transfer.no_address_text', { crypto })"
    />
  </div>
</template>

<script>
import { Cryptos } from '@/lib/constants'
import ChatDialog from '@/components/Chat/ChatDialog'
import Icon from '@/components/icons/BaseIcon'
import CryptoIcon from '@/components/icons/CryptoIcon'

export default {
  data: () => ({
    cryptos: Object.keys(Cryptos),
    menuItems: [
      {
        type: 'action',
        title: 'chats.attach_image',
        icon: 'mdi-image',
        disabled: true
      },
      {
        type: 'action',
        title: 'chats.attach_file',
        icon: 'mdi-file',
        disabled: true
      }
    ],
    dialog: false,
    crypto: ''
  }),
  methods: {
    sendFunds (crypto) {
      // check if user has crypto wallet
      // otherwise show dialog
      this.fetchCryptoAddress(crypto)
        .then(() => {
          this.$router.push({
            name: 'SendFunds',
            params: {
              cryptoCurrency: crypto,
              recipientAddress: this.partnerId
            },
            query: {
              from: `/chats/${this.partnerId}`
            }
          })
        })
        .catch(() => {
          this.crypto = crypto
          this.dialog = true
        })
    },
    fetchCryptoAddress (crypto) {
      if (crypto === Cryptos.ADM) {
        return Promise.resolve()
      }

      return this.$store.dispatch('partners/fetchAddress', {
        crypto,
        partner: this.partnerId
      }).then(address => {
        if (!address) throw new Error('No crypto wallet address')

        return address
      })
    }
  },
  components: {
    ChatDialog,
    Icon,
    CryptoIcon
  },
  props: {
    partnerId: {
      type: String,
      default: ''
    }
  }
}
</script>

<style lang="stylus" scoped>
@import '~vuetify/src/stylus/settings/_colors.styl'

.v-menu__content
  max-height: 70%
  min-width: 200px!important

/** Themes **/
.theme--light
  .chat-menu
    &__icon
      color: $grey.darken-1
.theme--dark
  .chat-menu
    &__icon
      color: $shades.white
</style>
