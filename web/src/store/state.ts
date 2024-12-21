import { createStore } from "solid-js/store"

// @todo Add the player object and other player-related methods to share across multiple
// components. This will allow us to control the player from any component without
// passing props down the component tree.
export const [state, setState] = createStore({ pipActive: false })
