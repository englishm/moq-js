import { ControlMessageType, Version } from "."
import { KeyValuePairs, Parameters } from "../base_data"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { getLogger } from "../../common/logger"

const log = getLogger()

export interface ClientSetup {
	versions: Version[]
	params: Parameters
}

export namespace ClientSetup {
	export function serialize(v: ClientSetup): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.ClientSetup)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.versions.length)
		v.versions.forEach((version) => {
			payloadBuf.putVarInt(version)
		})
		payloadBuf.putBytes(Parameters.serialize(v.params))
		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		log.trace("client setup: payload len:", payloadBuf.length, "msg len:", mainBuf.length)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): ClientSetup {
		const supportedVersionLen = reader.getNumberVarInt()
		const versions: Version[] = []
		for (let i = 0; i < supportedVersionLen; i++) {
			versions.push(reader.getNumberVarInt() as Version)
		}
		const params = Parameters.deserialize(reader)
		return {
			versions,
			params,
		}
	}
}
