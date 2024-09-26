
;; title: carbon-credit
;; version: 2.0
;; summary:GreenStack: Decentralized Carbon Credit Marketplace

;; description:GreenStack is a platform that tokenizes and trades carbon credits on the Stacks blockchain, leveraging Bitcoin's security and Stacks' smart contract capabilities to create a transparent, efficient market for carbon offsets.

;; Error codes
(define-constant ERR-OWNER-ONLY (err u100))
(define-constant ERR-NOT-TOKEN-OWNER (err u101))
(define-constant ERR-INSUFFICIENT-BALANCE (err u102))
(define-constant ERR-INVALID-AMOUNT (err u103))
(define-constant ERR-TRANSFER-FAILED (err u104))
(define-constant ERR-ALREADY-VERIFIED (err u105))
(define-constant ERR-NOT-VERIFIED (err u106))

;; Define the fungible token
(define-fungible-token carbon-credit)

;; Define data variables
(define-data-var contract-owner principal tx-sender)
(define-data-var total-supply uint u0)
(define-data-var verifier principal tx-sender)

;; Define map for project metadata
(define-map projects
  { project-id: uint }
  { name: (string-ascii 50),
    description: (string-ascii 500),
    total-credits: uint,
    verified: bool }
)

;; Define map for credit ownership with project association
(define-map credit-ownership
  { owner: principal, project-id: uint }
  { amount: uint }
)

;; Getters

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance carbon-credit account))
)

(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

(define-read-only (get-project (project-id uint))
  (map-get? projects { project-id: project-id })
)

(define-read-only (get-credit-balance (account principal) (project-id uint))
  (default-to 
    { amount: u0 }
    (map-get? credit-ownership { owner: account, project-id: project-id })
  )
)

;; Setters

(define-public (set-verifier (new-verifier principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-OWNER-ONLY)
    (ok (var-set verifier new-verifier))
  )
)

;; Project Management

(define-public (add-project (project-id uint) (name (string-ascii 50)) (description (string-ascii 500)) (total-credits uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-OWNER-ONLY)
    (asserts! (is-none (map-get? projects { project-id: project-id })) (err u107))
    (map-set projects
      { project-id: project-id }
      { name: name, 
        description: description, 
        total-credits: total-credits,
        verified: false }
    )
    (ok true)
  )
)

(define-public (verify-project (project-id uint))
  (let ((project (unwrap! (map-get? projects { project-id: project-id }) (err u108))))
    (asserts! (is-eq tx-sender (var-get verifier)) ERR-OWNER-ONLY)
    (asserts! (not (get verified project)) ERR-ALREADY-VERIFIED)
    (map-set projects
      { project-id: project-id }
      (merge project { verified: true })
    )
    (ok true)
  )
)

;; Token Operations

(define-public (mint (amount uint) (recipient principal) (project-id uint))
  (let ((project (unwrap! (map-get? projects { project-id: project-id }) (err u108))))
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-OWNER-ONLY)
    (asserts! (get verified project) ERR-NOT-VERIFIED)
    (asserts! (>= (get total-credits project) amount) ERR-INVALID-AMOUNT)
    (try! (ft-mint? carbon-credit amount recipient))
    (map-set projects
      { project-id: project-id }
      (merge project { total-credits: (- (get total-credits project) amount) })
    )
    (map-set credit-ownership
      { owner: recipient, project-id: project-id }
      { amount: (+ (get amount (get-credit-balance recipient project-id)) amount) }
    )
    (var-set total-supply (+ (var-get total-supply) amount))
    (ok true)
  )
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (project-id uint))
  (let (
    (sender-balance (get amount (get-credit-balance sender project-id)))
    (recipient-balance (get amount (get-credit-balance recipient project-id)))
  )
    (asserts! (is-eq tx-sender sender) ERR-NOT-TOKEN-OWNER)
    (asserts! (<= amount sender-balance) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-transfer? carbon-credit amount sender recipient))
    (map-set credit-ownership
      { owner: sender, project-id: project-id }
      { amount: (- sender-balance amount) }
    )
    (map-set credit-ownership
      { owner: recipient, project-id: project-id }
      { amount: (+ recipient-balance amount) }
    )
    (ok true)
  )
)

(define-public (retire (amount uint) (owner principal) (project-id uint))
  (let ((balance (get amount (get-credit-balance owner project-id))))
    (asserts! (is-eq tx-sender owner) ERR-NOT-TOKEN-OWNER)
    (asserts! (<= amount balance) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-burn? carbon-credit amount owner))
    (map-set credit-ownership
      { owner: owner, project-id: project-id }
      { amount: (- balance amount) }
    )
    (var-set total-supply (- (var-get total-supply) amount))
    (ok true)
  )
)

;; Initialize contract
(begin
  (try! (ft-mint? carbon-credit u0 (var-get contract-owner)))
)