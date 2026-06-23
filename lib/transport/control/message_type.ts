export enum Version {
	DRAFT_00 = 0xff000000,
	DRAFT_01 = 0xff000001,
	DRAFT_02 = 0xff000002,
	DRAFT_03 = 0xff000003,
	DRAFT_04 = 0xff000004,
	DRAFT_05 = 0xff000005,
	DRAFT_06 = 0xff000006,
	DRAFT_07 = 0xff000007,
	DRAFT_14 = 0xff00000e,
	DRAFT_16 = 0xff000010,
	KIXEL_00 = 0xbad00,
	KIXEL_01 = 0xbad01,
}

// Draft-16: Control Message Types (Table 1)
export enum ControlMessageType {
	ReservedSetupV00 = 0x1,

	RequestUpdate = 0x2,
	Subscribe = 0x3,
	SubscribeOk = 0x4,
	RequestError = 0x5,
	PublishNamespace = 0x6,
	RequestOk = 0x7,
	Namespace = 0x8,
	PublishNamespaceDone = 0x9,
	Unsubscribe = 0xa,
	PublishDone = 0xb,
	PublishNamespaceCancel = 0xc,
	TrackStatus = 0xd,
	NamespaceDone = 0xe,

	GoAway = 0x10,
	SubscribeNamespace = 0x11,

	MaxRequestId = 0x15,
	Fetch = 0x16,
	FetchCancel = 0x17,
	FetchOk = 0x18,
	RequestsBlocked = 0x1a,

	Publish = 0x1d,
	PublishOk = 0x1e,

	ClientSetup = 0x20,
	ServerSetup = 0x21,

	// Legacy aliases for backward compat during transition
	SubscribeUpdate = 0x2, // Same as RequestUpdate in draft-16
}

export namespace ControlMessageType {
	export function toString(t: ControlMessageType): string {
		switch (t) {
			case ControlMessageType.ReservedSetupV00:
				return "ReservedSetupV00"
			case ControlMessageType.GoAway:
				return "GoAway"
			case ControlMessageType.MaxRequestId:
				return "MaxRequestId"
			case ControlMessageType.RequestsBlocked:
				return "RequestsBlocked"
			case ControlMessageType.RequestUpdate:
				return "RequestUpdate"
			case ControlMessageType.Subscribe:
				return "Subscribe"
			case ControlMessageType.SubscribeOk:
				return "SubscribeOk"
			case ControlMessageType.RequestError:
				return "RequestError"
			case ControlMessageType.Unsubscribe:
				return "Unsubscribe"
			case ControlMessageType.PublishDone:
				return "PublishDone"
			case ControlMessageType.PublishNamespaceCancel:
				return "PublishNamespaceCancel"
			case ControlMessageType.TrackStatus:
				return "TrackStatus"
			case ControlMessageType.NamespaceDone:
				return "NamespaceDone"
			case ControlMessageType.Publish:
				return "Publish"
			case ControlMessageType.PublishOk:
				return "PublishOk"
			case ControlMessageType.PublishNamespace:
				return "PublishNamespace"
			case ControlMessageType.RequestOk:
				return "RequestOk"
			case ControlMessageType.Namespace:
				return "Namespace"
			case ControlMessageType.PublishNamespaceDone:
				return "PublishNamespaceDone"
			case ControlMessageType.SubscribeNamespace:
				return "SubscribeNamespace"
			case ControlMessageType.Fetch:
				return "Fetch"
			case ControlMessageType.FetchCancel:
				return "FetchCancel"
			case ControlMessageType.FetchOk:
				return "FetchOk"
			case ControlMessageType.ClientSetup:
				return "ClientSetup"
			case ControlMessageType.ServerSetup:
				return "ServerSetup"
		}
	}
}
