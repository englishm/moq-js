import { Subscribe, GroupOrder, FilterType } from "./subscribe"
import { SubscribeOk } from "./subscribe_ok"
import { SubscribeUpdate } from "./subscribe_update"
import { SubscribeNamespace, SubscribeOptions } from "./subscribe_namespace"
import { Unsubscribe } from "./unsubscribe"
import { Publish } from "./publish"
import { PublishOk } from "./publish_ok"
import { PublishDone } from "./publish_done"
import { PublishNamespace } from "./publish_namespace"
import { PublishNamespaceDone } from "./publish_namespace_done"
import { PublishNamespaceCancel } from "./publish_namespace_cancel"
import { Namespace } from "./namespace"
import { NamespaceDone } from "./namespace_done"
import { TrackStatus } from "./track_status"
import { Fetch } from "./fetch"
import { FetchOk } from "./fetch_ok"
import { FetchCancel } from "./fetch_cancel"
import { GoAway } from "./go_away"
import { ClientSetup } from "./client_setup"
import { ServerSetup } from "./server_setup"
import { RequestOk } from "./request_ok"
import { RequestError } from "./request_error"
import { MaxRequestId } from "./max_request_id"
import { RequestsBlocked } from "./requests_blocked"

enum Version {
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

// Discriminated union where data type matches the control message type
type MessageWithType =
	| { type: ControlMessageType.Publish; message: Publish }
	| { type: ControlMessageType.PublishOk; message: PublishOk }
	| { type: ControlMessageType.PublishDone; message: PublishDone }
	| { type: ControlMessageType.PublishNamespace; message: PublishNamespace }
	| { type: ControlMessageType.PublishNamespaceDone; message: PublishNamespaceDone }
	| { type: ControlMessageType.PublishNamespaceCancel; message: PublishNamespaceCancel }
	| { type: ControlMessageType.Namespace; message: Namespace }
	| { type: ControlMessageType.NamespaceDone; message: NamespaceDone }
	| { type: ControlMessageType.TrackStatus; message: TrackStatus }
	| { type: ControlMessageType.Fetch; message: Fetch }
	| { type: ControlMessageType.FetchOk; message: FetchOk }
	| { type: ControlMessageType.FetchCancel; message: FetchCancel }
	| { type: ControlMessageType.Subscribe; message: Subscribe }
	| { type: ControlMessageType.SubscribeOk; message: SubscribeOk }
	| { type: ControlMessageType.SubscribeUpdate; message: SubscribeUpdate }
	| { type: ControlMessageType.SubscribeNamespace; message: SubscribeNamespace }
	| { type: ControlMessageType.Unsubscribe; message: Unsubscribe }
	| { type: ControlMessageType.RequestOk; message: RequestOk }
	| { type: ControlMessageType.RequestError; message: RequestError }
	| { type: ControlMessageType.MaxRequestId; message: MaxRequestId }
	| { type: ControlMessageType.RequestsBlocked; message: RequestsBlocked }

type Message = Subscriber | Publisher

// Sent by subscriber
type Subscriber =
	| Subscribe
	| SubscribeUpdate
	| SubscribeNamespace
	| Unsubscribe
	| PublishOk
	| Fetch
	| FetchCancel
	| PublishNamespaceCancel
	| TrackStatus
	| MaxRequestId
	| RequestsBlocked
	| RequestOk
	| RequestError

// Sent by publisher
type Publisher =
	| SubscribeOk
	| PublishDone
	| Publish
	| PublishNamespace
	| PublishNamespaceDone
	| Namespace
	| NamespaceDone
	| FetchOk
	| MaxRequestId
	| RequestsBlocked
	| RequestOk
	| RequestError

function isSubscriber(m: ControlMessageType): boolean {
	return (
		m == ControlMessageType.Subscribe ||
		m == ControlMessageType.SubscribeUpdate ||
		m == ControlMessageType.Unsubscribe ||
		m == ControlMessageType.PublishOk ||
		m == ControlMessageType.PublishNamespaceCancel ||
		m == ControlMessageType.TrackStatus ||
		m == ControlMessageType.MaxRequestId ||
		m == ControlMessageType.RequestsBlocked ||
		m == ControlMessageType.RequestOk ||
		m == ControlMessageType.RequestError
	)
}

function isPublisher(m: ControlMessageType): boolean {
	return (
		m == ControlMessageType.SubscribeOk ||
		m == ControlMessageType.PublishDone ||
		m == ControlMessageType.Publish ||
		m == ControlMessageType.PublishNamespace ||
		m == ControlMessageType.PublishNamespaceDone ||
		m == ControlMessageType.Namespace ||
		m == ControlMessageType.NamespaceDone ||
		m == ControlMessageType.MaxRequestId ||
		m == ControlMessageType.RequestsBlocked ||
		m == ControlMessageType.RequestOk ||
		m == ControlMessageType.RequestError
	)
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

export {
	Subscribe,
	SubscribeOk,
	SubscribeUpdate,
	SubscribeNamespace,
	SubscribeOptions,
	Unsubscribe,
	Publish,
	PublishOk,
	PublishDone,
	PublishNamespace,
	PublishNamespaceDone,
	PublishNamespaceCancel,
	Namespace,
	NamespaceDone,
	TrackStatus,
	Fetch,
	FetchOk,
	FetchCancel,
	GoAway,
	ClientSetup,
	ServerSetup,
	MaxRequestId,
	RequestsBlocked,
	RequestOk,
	RequestError,
	Version,
	isSubscriber,
	isPublisher,
	MessageWithType,
	Message,
	GroupOrder,
	FilterType,
}
