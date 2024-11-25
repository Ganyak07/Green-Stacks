;; title: carbon-credit
;; version: 2.2
;; summary: GreenStack: Enhanced Decentralized Carbon Credit Marketplace

;; Error codes
(define-constant ERR-OWNER-ONLY (err u100))
(define-constant ERR-NOT-TOKEN-OWNER (err u101))
(define-constant ERR-INSUFFICIENT-BALANCE (err u102))
(define-constant ERR-INVALID-AMOUNT (err u103))
(define-constant ERR-TRANSFER-FAILED (err u104))
(define-constant ERR-ALREADY-VERIFIED (err u105))
(define-constant ERR-NOT-VERIFIED (err u106))
(define-constant ERR-PROJECT-EXISTS (err u107))
(define-constant ERR-PROJECT-NOT-FOUND (err u108))
(define-constant ERR-EXPIRED (err u109))
(define-constant ERR-PRICE-TOO-LOW (err u110))
(define-constant ERR-INVALID-PRINCIPAL (err u111))
(define-constant ERR-INVALID-PROJECT (err u112))
(define-constant ERR-INVALID-EXPIRATION (err u113))
(define-constant ERR-ZERO-AMOUNT (err u114))

;; Constants for validation
(define-constant MIN-EXPIRATION-BLOCKS u1000)
(define-constant MAX-TOTAL-CREDITS u1000000000)
(define-constant ZERO_ADDRESS 'SP000000000000000000002Q6VF78)

;; Define the fungible token
(define-fungible-token carbon-credit)

;; Define data variables
(define-data-var contract-owner principal tx-sender)
(define-data-var total-supply uint u0)
(define-data-var verifier principal tx-sender)
(define-data-var minimum-price uint u0)
(define-data-var last-tx-id uint u0)

;; Helper functions for validation
(define-private (is-valid-principal (address principal))
  (and 
    (not (is-eq address ZERO_ADDRESS))
    (not (is-eq address (var-get contract-owner)))
  )
)

(define-private (is-valid-amount (amount uint))
  (and
    (> amount u0)
    (<= amount MAX-TOTAL-CREDITS)
  )
)

(define-private (is-valid-expiration (expiration uint))
  (>= (- expiration block-height) MIN-EXPIRATION-BLOCKS)
)

(define-private (increment-tx-id)
  (var-set last-tx-id (+ (var-get last-tx-id) u1))
)

;; Helper function to get credit balance
(define-private (get-credit-balance-or-default (owner principal) (project-id uint))
  (default-to 
    { amount: u0, purchase-date: u0, purchase-price: u0 }
    (map-get? credit-ownership { owner: owner, project-id: project-id })
  )
)

;; Enhanced project metadata
(define-map projects
  { project-id: uint }
  { 
    name: (string-ascii 50),
    description: (string-ascii 500),
    total-credits: uint,
    verified: bool,
    expiration: uint,
    price-per-credit: uint,
    location: (string-ascii 100),
    category: (string-ascii 50),
    creation-height: uint
  }
)

;; Credit ownership with project association
(define-map credit-ownership
  { owner: principal, project-id: uint }
  { 
    amount: uint,
    purchase-date: uint,
    purchase-price: uint
  }
)

;; Trading history
(define-map trading-history
  { tx-id: uint }
  {
    seller: principal,
    buyer: principal,
    project-id: uint,
    amount: uint,
    price: uint,
    timestamp: uint
  }
)

;; Read-only functions
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
  (ok (get-credit-balance-or-default account project-id))
)

;; Public functions
(define-public (set-verifier (new-verifier principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-OWNER-ONLY)
    (asserts! (is-valid-principal new-verifier) ERR-INVALID-PRINCIPAL)
    (ok (var-set verifier new-verifier))
  )
)

(define-public (set-minimum-price (new-price uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-OWNER-ONLY)
    (asserts! (> new-price u0) ERR-INVALID-AMOUNT)
    (ok (var-set minimum-price new-price))
  )
)

(define-public (add-project 
    (project-id uint) 
    (name (string-ascii 50)) 
    (description (string-ascii 500)) 
    (total-credits uint)
    (expiration uint)
    (price-per-credit uint)
    (location (string-ascii 100))
    (category (string-ascii 50))
  )
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-OWNER-ONLY)
    (asserts! (is-none (map-get? projects { project-id: project-id })) ERR-PROJECT-EXISTS)
    (asserts! (is-valid-amount total-credits) ERR-INVALID-AMOUNT)
    (asserts! (is-valid-expiration expiration) ERR-INVALID-EXPIRATION)
    (asserts! (>= price-per-credit (var-get minimum-price)) ERR-PRICE-TOO-LOW)
    
    (map-set projects
      { project-id: project-id }
      { 
        name: name, 
        description: description, 
        total-credits: total-credits,
        verified: false,
        expiration: expiration,
        price-per-credit: price-per-credit,
        location: location,
        category: category,
        creation-height: block-height
      }
    )
    (ok true)
  )
)

(define-public (mint (amount uint) (recipient principal) (project-id uint))
  (let (
    (project (unwrap! (map-get? projects { project-id: project-id }) ERR-PROJECT-NOT-FOUND))
    (recipient-balance (get-credit-balance-or-default recipient project-id))
  )
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-OWNER-ONLY)
    (asserts! (is-valid-principal recipient) ERR-INVALID-PRINCIPAL)
    (asserts! (is-valid-amount amount) ERR-INVALID-AMOUNT)
    (asserts! (get verified project) ERR-NOT-VERIFIED)
    (asserts! (>= (get total-credits project) amount) ERR-INSUFFICIENT-BALANCE)
    (asserts! (< block-height (get expiration project)) ERR-EXPIRED)
    
    ;; Mint tokens
    (try! (ft-mint? carbon-credit amount recipient))
    
    ;; Update project credits
    (map-set projects
      { project-id: project-id }
      (merge project { total-credits: (- (get total-credits project) amount) })
    )
    
    ;; Update ownership
    (map-set credit-ownership
      { owner: recipient, project-id: project-id }
      { 
        amount: (+ (get amount recipient-balance) amount),
        purchase-date: block-height,
        purchase-price: (get price-per-credit project)
      }
    )
    
    ;; Update supply
    (var-set total-supply (+ (var-get total-supply) amount))
    
    (ok true)
  )
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (project-id uint))
  (let (
    (project (unwrap! (map-get? projects { project-id: project-id }) ERR-PROJECT-NOT-FOUND))
    (sender-balance (get-credit-balance-or-default sender project-id))
    (recipient-balance (get-credit-balance-or-default recipient project-id))
  )
    (asserts! (is-eq tx-sender sender) ERR-NOT-TOKEN-OWNER)
    (asserts! (is-valid-principal recipient) ERR-INVALID-PRINCIPAL)
    (asserts! (is-valid-amount amount) ERR-INVALID-AMOUNT)
    (asserts! (<= amount (get amount sender-balance)) ERR-INSUFFICIENT-BALANCE)
    (asserts! (< block-height (get expiration project)) ERR-EXPIRED)
    
    ;; Transfer tokens
    (try! (ft-transfer? carbon-credit amount sender recipient))
    
    ;; Update ownership records
    (map-set credit-ownership
      { owner: recipient, project-id: project-id }
      { 
        amount: (+ (get amount recipient-balance) amount),
        purchase-date: block-height,
        purchase-price: (get price-per-credit project)
      }
    )
    
    ;; Record trading history
    (let ((tx-id (var-get last-tx-id)))
      (map-set trading-history
        { tx-id: tx-id }
        {
          seller: sender,
          buyer: recipient,
          project-id: project-id,
          amount: amount,
          price: (get price-per-credit project),
          timestamp: block-height
        }
      )
      (increment-tx-id)
    )
    
    (ok true)
  )
)


