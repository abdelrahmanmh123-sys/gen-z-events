# Gen Z Events — Auto-Generated Symbol & Line Index

Regenerate via `powershell -ExecutionPolicy Bypass -File .agents/skills/gen-z-events-dev/scripts/gen-index.ps1`.
Read this map first to jump straight to exact `StartLine-EndLine` ranges without reading entire files.

## firestore.rules (626 lines)
isValidId:L13, incoming:L17, existing:L21, isSignedIn:L25, isVerified:L29, emailToDocId:L37, isPrimaryAdmin:L41, isSuperAdmin:L45, isGateStaff:L53, isStaff:L59, isValidString:L63, isValidTier:L67, isValidHexColor:L71, isValidPosterUrl:L75, isValidTierColors:L86, isValidPromoDiscount:L96, isValidFanPricing:L107, isValidConcert:L133, isValidBooking:L175, isValidPromo:L227, isValidUserProfile:L244, isValidWaitlistEntry:L268, isValidAdminMember:L282, isValidAdminSession:L295, isValidPaymentConfig:L308, isValidAuditLog:L323, match /concerts/{concertId}:L359, match /promos/{promoId}:L387, match /bookings/{bookingId}:L412, match /users/{userId}:L476, match /waitlist/{entryId}:L510, match /admins/{adminId}:L529, match /adminSessions/{sessionId}:L556, match /paymentConfig/{configId}:L583, match /auditLogs/{logId}:L607

## Source Modules (`src/`)

| File | Lines | Exports (`Symbol:Line`) |
| :--- | ---: | :--- |
| `src/App.tsx` | 890 | App:L70 |
| `src/components/admin/AdminAuditLog.tsx` | 411 | AdminAuditLog:L60 |
| `src/components/admin/AdminCheckin.tsx` | 931 | AdminCheckin:L58 |
| `src/components/admin/AdminCheckinRoster.tsx` | 294 | RosterFilter:L12, AdminCheckinRoster:L37 |
| `src/components/admin/AdminCheckinVerdictCard.tsx` | 274 | AdminCheckinVerdictCard:L30 |
| `src/components/admin/AdminContentPromos.tsx` | 456 | AdminContentPromos:L26 |
| `src/components/admin/AdminDashboard.tsx` | 319 | AdminDashboard:L30 |
| `src/components/admin/AdminManage.tsx` | 914 | AdminManage:L51 |
| `src/components/admin/AdminOfflineTickets.tsx` | 661 | AdminOfflineTickets:L62 |
| `src/components/admin/AdminQuickSearchModal.tsx` | 676 | AdminQuickSearchModal:L61 |
| `src/components/admin/AdminSchedule.tsx` | 488 | AdminSchedule:L29 |
| `src/components/admin/AdminTeam.tsx` | 267 | AdminTeam:L19 |
| `src/components/admin/AdminWorkspace.tsx` | 399 | AdminWorkspace:L63 |
| `src/components/admin/GoogleFormSyncPanel.tsx` | 908 | GoogleFormSyncPanel:L81 |
| `src/components/admin/OfflineExcelPreviewPanel.tsx` | 224 | OfflineExcelPreviewPanel:L23 |
| `src/components/admin/OfflineManualSaleForm.tsx` | 250 | OfflineManualSaleForm:L37 |
| `src/components/admin/OfflineSalesLedger.tsx` | 298 | OfflineSalesLedger:L39 |
| `src/components/admin/TierColorEditor.tsx` | 230 | TierColorEditor:L22 |
| `src/components/AuthProfileModal.tsx` | 1014 | PENDING_PROFILE_STORAGE_KEY:L41, PendingSignupProfile:L43, savePendingSignupProfile:L50, readPendingSignupProfile:L58, clearPendingSignupProfile:L75, AuthProfileModal:L106 |
| `src/components/BookingModal.tsx` | 925 | BookingModal:L72 |
| `src/components/BrandLogo.tsx` | 35 | BrandLogo:L15 |
| `src/components/ConcertCard.tsx` | 207 | ConcertCard:L45 |
| `src/components/ErrorBoundary.tsx` | 66 | ErrorBoundary:L10 |
| `src/components/Header.tsx` | 216 | Header:L18 |
| `src/components/HeroSection.tsx` | 195 | HeroSection:L16 |
| `src/components/PassTiersSection.tsx` | 85 | PassTiersSection:L12 |
| `src/components/TicketsModal.tsx` | 706 | TicketsModal:L54 |
| `src/components/TicketVisualCard.tsx` | 138 | TicketVisualCard:L14 |
| `src/data/defaults.ts` | 91 | PRIMARY_ADMIN_EMAIL:L3, HERO_IMAGE_PATH:L4, BRAND_LOGO_PATH:L5, DEFAULT_TIER_COLORS:L7, TIER_COLOR_SWATCHES:L14, TICKET_TIERS:L25, PAYMENT_PHONE_NUMBER:L72, PAYMENT_WHATSAPP_NUMBER:L73, PAYMENT_WHATSAPP_DISPLAY:L74, PAYMENT_METHODS:L76 |
| `src/firebase.ts` | 144 | re-export {formatFriendlyFirebaseError}:L20, db:L59, auth:L60, googleProvider:L61, OperationType:L64, FirestoreErrorInfo:L73, logFirestoreError:L114, handleFirestoreError:L123, ensureFreshVerifiedToken:L137 |
| `src/i18n/ar.ts` | 559 | arTranslations:L3 |
| `src/i18n/catalogCopy.ts` | 330 | Language:L11, TextDirection:L12, LANGUAGE_STORAGE_KEY:L14, resolveInitialLanguage:L16, getDirection:L20, formatCurrencyEgp:L24, TIER_COPY:L29, getTierCopy:L95, PAYMENT_COPY:L99, buildPaymentMethodCopy:L133, buildFooterSubtitle:L166, TICKET_ENTRY_TERMS:L178, getPaymentMethodLabel:L244, getGenreLabel:L261, getAdminRoleLabel:L266, AUDIT_ACTION_LABELS:L271, getAuditActionLabel:L312, SWATCH_NAME_AR:L316, getSwatchName:L327 |
| `src/i18n/en.ts` | 560 | enTranslations:L3 |
| `src/i18n/LanguageContext.tsx` | 79 | LanguageProvider:L31, useLanguage:L73 |
| `src/i18n/messages.ts` | 147 | formatPromoTiersSummary:L104, localizeKnownMessage:L115 |
| `src/i18n/translations.ts` | 15 | re-export ./catalogCopy:L4, re-export ./messages:L5, re-export {enTranslations}:L6, re-export {arTranslations}:L7, translations:L9, TranslationKey:L14, TranslationDict:L15 |
| `src/main.tsx` | 24 | *(module)* |
| `src/services/firestore/auditHelper.ts` | 42 | resolveActor:L10, recordAuditLog:L23 |
| `src/services/firestore/bookingsRepo.ts` | 611 | createBooking:L20, cancelPendingBooking:L35, adminConfirmPayment:L44, adminUndoPayment:L97, CheckInScanResult:L158, adminScanCheckIn:L165, adminDecrementCheckIn:L239, adminToggleCheckIn:L303, adminConfirmAndCheckIn:L316, adminDeleteBooking:L388, adminCreateOfflineBooking:L437, adminBulkImportOfflineBookings:L484 |
| `src/services/firestore/concertsRepo.ts` | 220 | adminSaveConcert:L15, adminDeleteConcert:L67, createWaitlistEntry:L89, deleteWaitlistEntry:L103, adminSavePromo:L112, adminDeletePromo:L157, adminSavePaymentConfig:L175 |
| `src/services/firestore/staffRepo.ts` | 201 | upsertUserProfile:L15, adminAddMember:L59, adminRemoveMember:L109, checkIsEmailAdmin:L133, createAdminSession:L158, touchAdminSession:L181, removeAdminSession:L195 |
| `src/services/firestoreService.ts` | 3 | re-export ./firestore/bookingsRepo:L1, re-export ./firestore/concertsRepo:L2, re-export ./firestore/staffRepo:L3 |
| `src/services/googleFormsService.ts` | 258 | GOOGLE_FORMS_SCOPES:L9, GoogleFormsApiErrorCode:L14, GoogleFormsApiError:L22, getCachedFormsAccessToken:L71, getCachedFormsAccountEmail:L75, clearCachedFormsAccessToken:L79, subscribeFormsAuthChange:L85, connectGoogleFormsAccount:L96, fetchGoogleFormSchema:L211, fetchAllGoogleFormResponses:L226 |
| `src/types.ts` | 203 | TierId:L1, OnlinePaymentMethodId:L3, PaymentMethodId:L5, PaymentStatus:L7, AdminRole:L9, TierMeta:L11, PaymentMethodMeta:L23, TierPrices:L31, TierColors:L38, Concert:L45, Booking:L67, Promo:L96, UserProfile:L107, WaitlistEntry:L120, AdminMember:L131, AdminSession:L141, PaymentConfig:L151, AuditAction:L160, AuditTargetType:L179, AuditActor:L182, AuditLogEntry:L188, SortOption:L203 |
| `src/utils/auditLog.ts` | 254 | AUDIT_ACTIONS:L16, GATE_STAFF_AUDIT_ACTIONS:L37, AUDIT_TARGET_TYPES:L44, AuditCategory:L53, AUDIT_ACTION_CATEGORY:L55, SENSITIVE_AUDIT_ACTIONS:L76, AUDIT_LOG_PAGE_SIZE:L85, AUDIT_LOG_MAX_ENTRIES:L86, canRoleRecordAuditAction:L88, isSensitiveAuditAction:L94, generateAuditLogId:L98, AuditLogInput:L121, buildAuditLogRecord:L135, describeBookingForAudit:L158, describeEntryProgress:L178, getAuditTimestampMs:L185, sortAuditLogsNewestFirst:L200, AuditLogFilter:L204, filterAuditLogs:L210, listAuditActors:L226, buildAuditLogCsv:L237 |
| `src/utils/booking/exports.ts` | 107 | sanitizeSpreadsheetCell:L4, escapeCsvCell:L12, buildAttendeesCsv:L24, buildCalendarIcs:L77 |
| `src/utils/booking/firebaseErrors.ts` | 90 | formatFriendlyFirebaseError:L1 |
| `src/utils/booking/offlineParser.ts` | 358 | MAX_OFFLINE_QTY_PER_ROW:L6, OFFLINE_USER_ID:L7, ParsedOfflineRowError:L9, ParsedOfflineBatchResult:L14, normalizeTierValue:L43, normalizeOfflineMobile:L121, parseOfflineTicketRows:L132 |
| `src/utils/booking/pricing.ts` | 203 | MAX_QTY_PER_ORDER:L3, suggestTierPrices:L5, getTierUnitPrice:L16, ALL_PROMO_TIERS:L25, normalizePromoTiers:L27, togglePromoTier:L40, PromoEvaluation:L57, evaluatePromo:L65, calculateOrderTotals:L109, DEFAULT_CATEGORY_COLORS:L132, isValidHexColor:L139, normalizeHexColor:L143, validateTierColors:L160, getTierColorHex:L184, hexToRgba:L196 |
| `src/utils/booking/rbacAndTickets.ts` | 291 | ADMIN_SESSION_TTL_MS:L3, emailToDocId:L5, sanitizeId:L14, generateBookingCode:L25, getBookingCheckedInCount:L43, getBookingRemainingEntries:L53, isBookingFullyCheckedIn:L60, formatCheckInProgress:L67, computeRestoredSeatsLeft:L73, buildUndoPaymentPatch:L84, canDisplayBookingQr:L102, computeAdminKpis:L108, AdminTab:L126, StaffPermissions:L136, getStaffPermissions:L160, canAccessAdminTab:L218, sortByCreatedAtDesc:L238, sortByUpdatedAtDesc:L244, isAdminSessionActive:L260, partitionAdminSessions:L272 |
| `src/utils/booking/schedule.ts` | 351 | formatDateTimeDisplay:L5, computeCountdown:L40, filterAndSortConcerts:L53, getNextUpcomingConcert:L87, fitPosterDimensions:L96, getDefaultUpcomingIsoDate:L116, ConcertEditDraft:L128, ConcertEditValidationResult:L147, computeAdjustedSeatsLeft:L162, normalizeScheduleDateTime:L201, validateAndBuildConcertEditPayload:L214, resolveBookingConcertDetails:L342 |
| `src/utils/booking/validation.ts` | 563 | MAX_POSTER_DATA_URL_LENGTH:L5, isSafeHttpsUrl:L7, isSafeImageUrl:L19, BookingInputValidation:L30, validateBookingInput:L35, validateWaitlistInput:L73, SignupValidationResult:L103, PasswordStrengthResult:L113, toAsciiDigits:L191, normalizeEgyptianMobile:L197, AuthUserLike:L223, isVerifiedFanAccount:L229, isPendingEmailVerification:L234, isEmailVerifiedAdminCandidate:L239, validateFullName:L243, validateEgyptianMobile:L275, validateEmailAddress:L301, evaluatePasswordStrength:L326, validateSignupInput:L344, validateProfileUpdateInput:L390, parseBoundedIntInput:L429, PAYMENT_CONFIG_DOC_ID:L445, DEFAULT_PAYMENT_CONFIG:L447, resolvePaymentConfig:L454, PaymentConfigValidationResult:L490, validatePaymentConfigInput:L504 |
| `src/utils/bookingLogic.ts` | 7 | re-export ./booking/pricing:L1, re-export ./booking/validation:L2, re-export ./booking/rbacAndTickets:L3, re-export ./booking/exports:L4, re-export ./booking/schedule:L5, re-export ./booking/offlineParser:L6, re-export ./booking/firebaseErrors:L7 |
| `src/utils/excelOffline.ts` | 156 | ParsedSpreadsheetFile:L5, readSpreadsheetFile:L12, downloadOfflineTemplateXlsx:L43, buildOfflineExportRows:L92, exportOfflineBookingsXlsx:L127 |
| `src/utils/gateScanLogic.ts` | 451 | GateScanStatus:L9, GateScanVerdict:L17, isGenZTicketCodeFormat:L37, formatScannedCodePreview:L46, buildAlreadyUsedVerdict:L52, buildGateScanSuccessVerdict:L127, evaluateGateQrScan:L215, buildPaymentRevertedVerdict:L298, buildUnreadableQrVerdict:L325, getCameraConstraintFallbacks:L344, CameraErrorInfo:L365, classifyCameraError:L374, computeDecodedImageDimensions:L436 |
| `src/utils/googleFormsMapper.ts` | 736 | DEFAULT_OFFLINE_FORM_ID:L11, DEFAULT_OFFLINE_FORM_EDIT_URL:L12, DEFAULT_OFFLINE_FORM_PUBLIC_URL:L13, GoogleFormQuestion:L16, GoogleFormSchema:L24, GoogleFormAnswerValue:L32, GoogleFormRawResponse:L39, GoogleFormFieldMapping:L47, GoogleFormMappedRow:L59, GoogleFormSyncResult:L75, extractGoogleFormId:L95, parseGoogleFormSchemaPayload:L122, autoMapFormQuestions:L227, buildDeterministicFormBookingCode:L375, resolveFormOutletRef:L415, MapFormResponsesOptions:L444, mapGoogleFormResponsesToBookings:L457 |
| `src/utils/passExport.ts` | 409 | playGateTone:L14, generateQrDataUrl:L62, generateOriginalQrDataUrl:L74, renderTicketPassPng:L114, copyTextToClipboard:L288, triggerFileDownload:L315, triggerDataUrlDownload:L327, compressPosterImage:L359 |
| `src/utils/shareConcert.ts` | 129 | ConcertSharePayload:L6, ShareOutcome:L12, ShareConcertOptions:L14, resolveShareUrl:L26, buildConcertShareData:L42, formatShareClipboardText:L77, shareConcertDetails:L91 |
| `src/utils/staffQuickSearch.ts` | 303 | QuickSearchScope:L9, StaffQuickSearchDataset:L11, StaffQuickSearchResults:L18, scoreBookingMatch:L43, scoreConcertMatch:L88, scorePromoMatch:L105, scoreWaitlistMatch:L119, runStaffQuickSearch:L142, toWhatsAppPhoneDigits:L250, buildStaffWhatsAppBookingUrl:L268, buildStaffWhatsAppWaitlistUrl:L290 |
| `src/utils/ticketDesign.ts` | 227 | TicketDesignKey:L4, TicketDesignSpec:L6, TICKET_CANVAS_WIDTH:L19, TICKET_CANVAS_HEIGHT:L20, QR_ORIGINAL_EXPORT_SIZE:L21, QR_ORIGINAL_EXPORT_MARGIN:L22, buildQrDownloadFilename:L24, TICKET_STUB_SLOT:L45, TICKET_DESIGN_CATALOG:L55, getTicketDesignForTier:L102, TicketStubRects:L114, computeTicketStubRects:L121, TicketWhatsAppOptions:L166, buildTicketReceiptWhatsAppUrl:L178 |

## Test Suites

| Test File | Lines |
| :--- | ---: |
| `firestore.rules.test.ts` | 236 |
| `src/i18n/translations.test.ts` | 221 |
| `src/utils/auditLog.test.ts` | 188 |
| `src/utils/bookingLogic.test.ts` | 1408 |
| `src/utils/browserCompat.test.ts` | 71 |
| `src/utils/codebaseInvariants.test.ts` | 210 |
| `src/utils/gateScanLogic.test.ts` | 412 |
| `src/utils/googleFormsMapper.test.ts` | 253 |
| `src/utils/shareConcert.test.ts` | 130 |
| `src/utils/staffQuickSearch.test.ts` | 160 |
| `src/utils/ticketDesign.test.ts` | 165 |
| `tests/firestore.emulator.test.ts` | 333 |
