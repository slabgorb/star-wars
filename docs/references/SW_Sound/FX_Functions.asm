; =============== S U B	R O U T	I N E =======================================


FX_sub_73B0:
		ldy	#byte_72D1
		jmp	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73B7:
		ldy	#byte_72D6
		jmp	Init_Sound_FX

; ---------------------------------------------------------------------------

snd_Fire_Guns:
		ldy	#byte_7354
		jmp	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73C5:
		ldy	#byte_72ED
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73CB:
		ldy	#byte_737C
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73D1:
		ldy	#byte_72F6
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73D7:
		ldy	#byte_72FF
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73DD:
		ldy	#byte_7304
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73E3:
		ldy	#byte_72DB
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73E9:
		ldy	#byte_72E4
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73EF:
		ldy	#byte_7309
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73F5:
		ldy	#byte_730E
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_73FB:
		ldy	#byte_7346
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_7401:
		ldy	#byte_732F
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_7407:
		ldy	#byte_733C
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_740D:
		ldy	#byte_7341
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_7413:
		ldy	#byte_734F
		bra	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_7419:
		ldy	#byte_735D
		jmp	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_7420:
		ldy	#byte_736E
		jmp	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_7427:
		ldy	#byte_7373
		jmp	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_742E:
		ldy	#byte_7385
		jmp	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_7435:
		ldy	#byte_738A
		jmp	Init_Sound_FX

; ---------------------------------------------------------------------------

FX_loc_743C:
		ldy	#byte_738F
		jmp	*+3


Init_Sound_FX:				; Get bitmap (number 1 - 8) of POKEY registers to load
		lda	,y+
		sta	POKEY_Regs_Used
		ldx	#strct_sndFX1	; X points to RAM structure for	sound FX


FX_loc_744B:				; Each bit represents 1	- 8 POKEY channels (across 2 chips) for	FX use
		asl	POKEY_Regs_Used
		bcc	FX_loc_7462

		ldd	,y++		; Load FX freq pointer
		std	,x
		ldd	,y++		; Load FX volume/distortion pointer
		std	5,x
		lda	#1		; Set timers ready for init value load
		sta	3,x
		sta	2,x
		sta	8,x
		sta	7,x


FX_loc_7462:
		leax	$A,x
		lda	POKEY_Regs_Used
		bne	FX_loc_744B	; Loop for all POKEY registers requested

		rts

; End of function FX_sub_73B0


; =============== S U B	R O U T	I N E =======================================


Sound_FX_1:
		ldx	#strct_sndFX1	; Point	x to sound FX buffer RAM
		ldb	#0


FX_loc_746F:				; Y has	FX freq	or volume/dist	pointer
		ldy	,x
		beq	FX_loc_74A5	; Check	for active sound FX pointer

		dec	2,x		; Decrement 'no change' timer
		bne	FX_loc_74A5

		dec	3,x		; If change timer done then go to add Freq or Vol value
		bne	FX_loc_7493

		leay	4,y		; Add 4	to Y FX	pointer
		sty	,x		; Save new pointer position
		lda	-4,y
		bne	FX_loc_748B	; Check	for end	of FX 0	byte marker

		sta	,x
		sta	1,x		; Clear	pointer	at end of FX
		bra	FX_loc_749F

; ---------------------------------------------------------------------------

FX_loc_748B:
		sta	3,x
		lda	-2,y
		sta	4,x
		bra	FX_loc_7499

; ---------------------------------------------------------------------------

FX_loc_7493:
		lda	4,x
		adda	-1,y		; Add adder value to Freq
		sta	4,x


FX_loc_7499:				; Reset	no change timer
		lda	-3,y
		sta	2,x
		lda	4,x		; Get new freq/vol


FX_loc_749F:				; Point	to POKEY base
		ldy	#$1800
		sta	b,y		; Store	new freq/vol in	POKEY register


FX_loc_74A5:
		leax	5,x
		incb
		cmpb	#$10		; Check	for 16 POKEY regsister addresses
		bcs	FX_loc_746F

		rts

; End of function Sound_FX_1
