stru_74DB:
;		ptrRAM_Music <$2200, 1,	$1818, 0, $1818>
		fdb	$2200
		fcb	1
		fdb	$1818
		fcb	0
		fdb	$1818
;		ptrRAM_Music <$2219, 2,	$181C, 0, $181C>
		fdb	$2219
		fcb	2
		fdb	$181C
		fcb	0
		fdb	$181C
;		ptrRAM_Music <$2232, 4,	$1810, 0, $1810>
		fdb	$2232
		fcb	4
		fdb	$1810
		fcb	0
		fdb	$1810
;		ptrRAM_Music <$224B, 8,	$1814, 0, $1814>
		fdb	$224B
		fcb	8
		fdb	$1814
		fcb	0
		fdb	$1814
;		ptrRAM_Music <$2264, $10, $1814, 8, $1816>
		fdb	$2264
		fcb	$10
		fdb	$1814
		fcb	8
		fdb	$1816
;		ptrRAM_Music <$227D, $20, $1814, $18, $181A>
		fdb	$227D
		fcb	$20
		fdb	$1814
		fcb	$18
		fdb	$181A
;		ptrRAM_Music <$2296, $40, $1814, $38, $181E>
		fdb	$2296
		fcb	$40
		fdb	$1814
		fcb	$38
		fdb	$181E
;		ptrRAM_Music <$22AF, $80, $1814, $78, $1812>
		fdb	$22AF
		fcb	$80
		fdb	$1814
		fcb	$78
		fdb	$1812

; =============== S U B	R O U T	I N E =======================================


Mus_sub_751B:
		jsr	Mus_sub_7706

		ldb	#2
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#4
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#6
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#8
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_751B


; =============== S U B	R O U T	I N E =======================================


Mus_sub_753C:
		jsr	Mus_sub_7706

		ldb	#$E
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$10
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#$12
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$14
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_753C


; =============== S U B	R O U T	I N E =======================================


Mus_sub_755D:
		jsr	Mus_sub_7706

		ldb	#$16
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$18
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#$1A
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$1C
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_755D


; =============== S U B	R O U T	I N E =======================================


Mus_sub_757E:
		jsr	Mus_sub_7706

		ldb	#$1E
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$20 ; ' '
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#$22 ; '"'
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$24 ; '$'
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_757E


; =============== S U B	R O U T	I N E =======================================


Mus_sub_759F:
		jsr	Mus_sub_7706

		ldb	#$26 ; '&'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$28 ; '('
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#$2A ; '*'
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$2C ; ','
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_759F


; =============== S U B	R O U T	I N E =======================================


Mus_sub_75C0:
		jsr	Mus_sub_7706

		ldb	#$2E ; '.'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$30 ; '0'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#$32 ; '2'
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$34 ; '4'
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_75C0


; =============== S U B	R O U T	I N E =======================================


Mus_sub_75E1:
		jsr	Mus_sub_7706

		ldb	#$36 ; '6'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$38 ; '8'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#$3A ; ':'
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$3C ; '<'
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_75E1


; =============== S U B	R O U T	I N E =======================================


Mus_sub_7602:
		jsr	Mus_sub_7706

		ldb	#$3E ; '>'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$40 ; '@'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#$42 ; 'B'
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$44 ; 'D'
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_7602


; =============== S U B	R O U T	I N E =======================================


Mus_sub_7623:
		jsr	Mus_sub_7706

		ldb	#$46 ; 'F'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$48 ; 'H'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#$4A ; 'J'
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$4C ; 'L'
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_7623


; =============== S U B	R O U T	I N E =======================================


Mus_sub_7644:
		jsr	Mus_sub_7706

		ldb	#$4E ; 'N'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$50 ; 'P'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#$52 ; 'R'
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$54 ; 'T'
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_7644


; =============== S U B	R O U T	I N E =======================================


Mus_sub_7665:
		jsr	Mus_sub_7706

		ldb	#$56 ; 'V'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$58 ; 'X'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770E

		ldb	#$5A ; 'Z'
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$5C ; '\'
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_7665


; =============== S U B	R O U T	I N E =======================================


Mus_sub_7686:
		jsr	Mus_sub_770E	; Test mode tones

		ldb	#$5E ; '^'
		jsr	Mus_sub_776B

		jsr	Mus_sub_7712

		ldb	#$60 ; '`'
		jsr	Mus_sub_776B

		jsr	Mus_sub_7706

		ldb	#$62 ; 'b'
		jsr	Mus_sub_776B

		jsr	Mus_sub_770A

		ldb	#$64 ; 'd'
		jsr	Mus_sub_776B

		rts

; End of function Mus_sub_7686


; =============== S U B	R O U T	I N E =======================================


Init_Music:
		lda	#0		; Put POKEY in init mode
		sta	$1837
		sta	$183F
		sta	<DPbyte_12
		jsr	Mus_sub_7706

		jsr	Mus_sub_770A

		jsr	Mus_sub_770E

		jsr	Mus_sub_7712

		jsr	Mus_sub_7716

		jsr	Mus_sub_771A

		jsr	Mus_sub_771E

		jsr	Mus_sub_7722

		lda	#3
		sta	$1837		; Reset	POKEY
		sta	$183F
		lda	#$78 ; 'x'      ; Put POKEY into 16 bit mode for both channels
		sta	$1830
		lda	#$78 ; 'x'
		sta	$1838
		rts

; End of function Init_Music

; ---------------------------------------------------------------------------
		fcb $86, 0, $B7, $18, $30, $B7,	$18, $38, $86, 1, $26, $B, $86,	$78, $B7, $18 ;	Unused?	Doesn't seem to be read from
		fcb $30, $86, $78, $B7,	$18, $38, $4F, $97, $12, $8D, $F, $8D, $11, $8D, $13, $8D
		fcb $15, $8D, $17, $8D,	$19, $8D, $1B, $8D, $1D, $39

; =============== S U B	R O U T	I N E =======================================


Mus_sub_7706:
		lda	#0
		bra	Mus_loc_7726

; End of function Mus_sub_7706


; =============== S U B	R O U T	I N E =======================================


Mus_sub_770A:
		lda	#8
		bra	Mus_loc_7726

; End of function Mus_sub_770A


; =============== S U B	R O U T	I N E =======================================


Mus_sub_770E:
		lda	#$10
		bra	Mus_loc_7726

; End of function Mus_sub_770E


; =============== S U B	R O U T	I N E =======================================


Mus_sub_7712:
		lda	#$18
		bra	Mus_loc_7726

; End of function Mus_sub_7712


; =============== S U B	R O U T	I N E =======================================


Mus_sub_7716:
		lda	#$20 ; ' '
		bra	Mus_loc_7726

; End of function Mus_sub_7716


; =============== S U B	R O U T	I N E =======================================


Mus_sub_771A:
		lda	#$28 ; '('
		bra	Mus_loc_7726

; End of function Mus_sub_771A


; =============== S U B	R O U T	I N E =======================================


Mus_sub_771E:
		lda	#$30 ; '0'
		bra	Mus_loc_7726

; End of function Mus_sub_771E


; =============== S U B	R O U T	I N E =======================================


Mus_sub_7722:
		lda	#$38 ; '8'
		bra	*+2


Mus_loc_7726:				; X points to Music ROM	structure
		ldx	#stru_74DB
		leay	a,x		; Calc offset to one of	8 ROM structures


Mus_loc_772B:				; U points to RAM structure
		ldu	,y
		lda	2,y		; Called 4 times at start and end of a music segment
		coma
		anda	<DP_MusChFlg
		sta	<DP_MusChFlg
		lda	#7
		sta	$A,u
		lda	#$C0 ; 'À'
		sta	$C,u
		lda	#$A0 ; ' '
		sta	$E,u
		ldd	#0
		std	,u
		sta	$D,u
		sta	$B,u
		std	8,u
		sta	$16,u
		std	$12,u
		sta	$F,u
		std	$10,u
		ldd	off_7A17
		std	2,u
		std	4,u
		ldx	3,y
		ldb	<DPbyte_12
		beq	Mus_loc_7768

		ldx	6,y
		clr	1,x
		rts

; ---------------------------------------------------------------------------

Mus_loc_7768:
		clr	3,x
		rts

; End of function Mus_sub_7722


; =============== S U B	R O U T	I N E =======================================


Mus_sub_776B:
		ldx	#MusPtrTab7
		abx
		ldd	,x
		ldx	,y
		std	,x
		lda	<DP_MusChFlg
		ora	2,y
		sta	<DP_MusChFlg
		rts

; End of function Mus_sub_776B


; =============== S U B	R O U T	I N E =======================================


Music_Sub2:
		lda	<DPbyte_A	; Counts up location 0x100A
		lsra
		bcc	loc_7792

		lda	#0
		bsr	Music_Sub1

		lda	#$10
		bsr	Music_Sub1

		lda	#$20 ; ' '
		bsr	Music_Sub1

		lda	#$30 ; '0'
		bsr	Music_Sub1

		rts

; ---------------------------------------------------------------------------

loc_7792:
		lda	#8
		bsr	Music_Sub1

		lda	#$18
		bsr	Music_Sub1

		lda	#$28 ; '('
		bsr	Music_Sub1

		lda	#$38 ; '8'
		bsr	Music_Sub1

		rts

; End of function Music_Sub2


; =============== S U B	R O U T	I N E =======================================


Music_Sub1:
		ldx	#stru_74DB	; Point	to ROM structure
		leay	a,x		; Load Y with pointer to ROM with offset A 0 - $38 in steps of 8
		ldu	,y		; Get RAM pointer from structure into U	reg
		lda	,u		; Get byte from	RAM data
		bne	Mus_loc_77AF	; If non-zero then do music routine

		rts

; ---------------------------------------------------------------------------

Mus_loc_77AF:				; Count	up RAM offset 0x0B until it hits 0xFF
		inc	$B,u
		bne	Mus_loc_77B5

		dec	$B,u		; Keep at 0xFF


Mus_loc_77B5:				; Get tempo value
		ldb	$C,u
		lda	#$FF
		addd	8,u		; Add to tempo total
		std	8,u
		lbpl	Mus_loc_7826


Mus_Cmd_8:				; U points to RAM Music	structure
		ldx	,u
		ldb	,x++		; X points to new ROM music script from	indexed	pointer	into
		stx	,u		; Store	next double incremented	script data address pointer to RAM structure
		tstb
		lbmi	Mus_loc_789A	; Test bit 7 of	first byte of music script. Bit	set = Command?

		beq	Mus_loc_77D0	; If bit 7 not set, and	not zero then

		addb	$D,u		; Add note adder data


Mus_loc_77D0:
		lda	<DPbyte_12
		beq	Mus_loc_77D7

		clra
		bra	Mus_loc_77E5

; ---------------------------------------------------------------------------

Mus_loc_77D7:
		aslb
		ldx	#Note_Freq_Table
		abx
		ldd	6,u
		subd	,x
		std	$10,u
		ldd	,x


Mus_loc_77E5:
		std	6,u
		ldx	,u
		lda	-1,x
		bne	Mus_loc_77FF

		ldd	$12,u
		lbeq	Mus_loc_772B

		std	,u
		ldd	#0
		std	$12,u
		jmp	Mus_Cmd_8

; ---------------------------------------------------------------------------

Mus_loc_77FF:
		clrb
		lsra
		lsra
		rorb
		addd	8,u
		std	8,u
		lda	-1,x
		anda	#1
		bne	Mus_loc_781E

		sta	$B,u
		clrb
		std	$10,u
		lda	<DP_MusChFlg
		anda	5,y
		beq	Mus_loc_7826

		lda	<DPbyte_12
		bne	Mus_loc_7826

		rts

; ---------------------------------------------------------------------------

Mus_loc_781E:
		lda	$F,u
		bne	Mus_loc_7826

		clrb
		std	$10,u


Mus_loc_7826:
		lda	<DP_MusChFlg
		anda	5,y
		beq	Mus_loc_7831

		lda	<DPbyte_12
		bne	Mus_loc_7831

		rts

; ---------------------------------------------------------------------------

Mus_loc_7831:
		lda	<DPbyte_A
		anda	#6
		bne	Mus_loc_783D

		asr	$10,u
		ror	$11,u


Mus_loc_783D:
		ldb	$B,u
		lsrb
		ldx	4,u
		abx
		ldb	,x
		sex
		tst	<DPbyte_12
		bne	Mus_loc_7850

		aslb
		rola
		aslb
		rola
		aslb
		rola


Mus_loc_7850:
		addd	6,u
		addd	$10,u
		ldx	3,y
		tst	<DPbyte_12
		beq	Mus_loc_785F

		ldx	6,y
		bra	Mus_loc_7861

; ---------------------------------------------------------------------------

Mus_loc_785F:
		sta	2,x


Mus_loc_7861:
		stb	,x
		ldd	6,u
		bne	Mus_loc_786D

		lda	#$F0 ; 'ğ'
		sta	<DPbyte_10
		bra	Mus_loc_7871

; ---------------------------------------------------------------------------

Mus_loc_786D:
		lda	#$FF
		sta	<DPbyte_10


Mus_loc_7871:
		ldb	$B,u
		cmpb	#$1F
		bcs	Mus_loc_7879

		ldb	#$1F


Mus_loc_7879:
		ldx	2,u
		lda	b,x
		adda	$A,u
		bpl	Mus_loc_7882

		clra


Mus_loc_7882:
		cmpa	#$10
		blt	Mus_loc_7888

		lda	#$F


Mus_loc_7888:
		ora	$E,u
		anda	<DPbyte_10
		ldx	3,y
		ldb	<DPbyte_12
		beq	Mus_loc_7897

		ldx	6,y
		sta	1,x
		rts

; ---------------------------------------------------------------------------

Mus_loc_7897:
		sta	3,x
		rts

; ---------------------------------------------------------------------------

Mus_loc_789A:
		ldx	,u
		lda	-1,x		; Load A with byte after command
		aslb			; Shift	B to get word offset, also removes bit 7 from command byte at same time
		cmpb	#$24 ; '$'
		lbcc	Mus_Cmd_8

		ldx	#Music_Jump_Table
		jmp	[b,x]

; End of function Music_Sub1

; ---------------------------------------------------------------------------
Music_Jump_Table:fdb Mus_Cmd_0
		fdb Mus_Cmd_1
		fdb Mus_Cmd_2
		fdb Mus_Cmd_3
		fdb Mus_Cmd_4		; Store	new note adder value
		fdb Mus_Cmd_5		; Add to note adder value
		fdb Mus_Cmd_6
		fdb Mus_Cmd_7
		fdb Mus_Cmd_8		; Process next script command
		fdb Mus_Cmd_8
		fdb Mus_Cmd_A
		fdb Mus_Cmd_B		; Write	to CI/O	2 Audio	Control
		fdb Mus_Cmd_C
		fdb Mus_Cmd_D
		fdb Mus_Cmd_E
		fdb Mus_Cmd_F
		fdb Mus_Cmd_JSR		; Command $10. Jump-sub	command
		fdb Mus_Cmd_Ret		; Command $11. Return from sub command

; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_7:
		asla
		tfr	a, b
		ldx	#MusTbl1
		abx
		ldd	,x
		std	2,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_7


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_6:
		asla
		tfr	a, b
		ldx	#off_7A17
		abx
		ldd	,x
		std	4,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_6


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_1:
		suba	$C,u		; Subtract [$C]	from new value,	invert and store


Mus_Cmd_0:				; Invert [$C] value
		nega
		sta	$C,u		; Set tempo?
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_1


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_3:
		adda	$A,u		; Add to [$A] value


Mus_Cmd_2:				; Store	new value
		sta	$A,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_3


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_5:
		adda	$D,u		; Add to note adder value


Mus_Cmd_4:				; Store	new note adder value
		sta	$D,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_5


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_A:
		sta	$E,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_A


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_B:
		sta	$1830		; Write	to CI/O	2 Audio	Control
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_B


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_C:
		sta	$F,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_C


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_D:
		asla
		tfr	a, b
		ldx	#MusPtrTab7	; Jump to subroutine from music	pointer	table?
		abx
		ldd	,u
		std	$12,u
		ldd	,x
		std	,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_D


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_E:
		sta	$16,u
		ldd	,u
		std	$14,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_E


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_F:
		dec	$16,u
		lbeq	Mus_Cmd_8

		ldd	$14,u
		std	,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_F


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_JSR:
		ldx	,u		; Music	script 'jump-sub' command?
		leax	1,x
		stx	$17,u		; Copy old script pointer to 'return' location?
		ldd	-2,x
		std	,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_JSR


; =============== S U B	R O U T	I N E =======================================


Mus_Cmd_Ret:
		ldd	$17,u		; Restore previous script pointer after	jump-sub command
		std	,u
		jmp	Mus_Cmd_8

; End of function Mus_Cmd_Ret

; ---------------------------------------------------------------------------
Note_Freq_Table:fdb 0
		fdb $B493
		fdb $AA70
		fdb $A0DF
		fdb $97D7
		fdb $8F51
		fdb $8745
		fdb $7FAD
		fdb $7882
		fdb $71BF
		fdb $6B5C
		fdb $6555
		fdb $5FA5
		fdb $5A46
		fdb $5535
		fdb $506C
		fdb $4BE8
		fdb $47A5
		fdb $439F
		fdb $3FD3
		fdb $3C3E
		fdb $38DC
		fdb $35AA
		fdb $32A7
		fdb $2FCF
		fdb $2D20
		fdb $2A97
		fdb $2832
		fdb $25F1
		fdb $23CF
		fdb $21CC
		fdb $1FE6
		fdb $1E1B
		fdb $1C6A
		fdb $1AD2
		fdb $1950
		fdb $17E4
		fdb $168C
		fdb $1548
		fdb $1416
		fdb $12F5
		fdb $11E4
		fdb $10E3
		fdb $FF0
		fdb $F0A
		fdb $E32
		fdb $D65
		fdb $CA4
		fdb $BEE
		fdb $B43
		fdb $AA0
		fdb $A07
		fdb $977
		fdb $8EE
		fdb $86E
		fdb $7F4
		fdb $782
		fdb $715
		fdb $6AF
		fdb $64F
		fdb $5F4
		fdb $59E
		fdb $54D
		fdb $500
		fdb $4B8
		fdb $474
		fdb $433
		fdb $3F7
		fdb $3BD
		fdb $387
		fdb $354
		fdb $324
		fdb $2F6
		fdb $2CB
		fdb $2A3
		fdb $27D
		fdb $258
		fdb $236
		fdb $216
		fdb $1F8
		fdb $1DB
		fdb $1C0
		fdb $1A7
		fdb $18E
		fdb $178
		fdb $162
		fdb $14E
		fdb $13B
		fdb $129
		fdb $118
		fdb $108
		fdb $F8
		fdb $EA
		fdb $DD
		fdb $D0
		fdb $C4
		fdb $B8
		fdb $AE
off_7A17:	fdb MusTbl3
		fdb MusTbl2
MusTbl1:	fdb MusTbl3
		fdb MusTbl4
		fdb MusTbl5
		fdb MusTbl6
		fdb MusTbl7
MusTbl2:	fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
		fcb $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF,	$FF, $FF, $FF, $FF
MusTbl3:	fcb 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0
		fcb 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0
MusTbl4:	fcb $A,	9, 8, 7, 6, 5, 4, 3, 2,	2, 1, 1, 1, 1, 1, 1
		fcb 0, 0, 0, 0,	0, 0, 0, $FF, $FF, $FF,	$FF, $FF, $FF, $FF, $FF, $FE
MusTbl5:	fcb 3, 7, 7, 6,	5, 5, 4, 4, 4, 4, 3, 3,	3, 3, 3, 3
		fcb 2, 2, 2, 2,	2, 2, 1, 1, 1, 1, 1, 1,	0, 0, 0, $FF
MusTbl6:	fcb 7, 6, 5, 4,	4, 3, 3, 2, 2, 2, 1, 1,	1, 1, 0, 0
		fcb 0, 0, 0, 0,	0, 0, $FF, $FF,	$FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF
MusTbl7:	fcb $A,	9, 8, 7, 6, 5, 4, 4, 3,	3, 3, 3, 3, 3, 3, 3
		fcb 2, 2, 2, 2,	2, 2, 2, 2, 2, 2, 2, 2,	2, 2, 2, 2

