Spch_sub_7B65:

; FUNCTION CHUNK AT 7C31 SIZE 0000000F BYTES

		ldd	#Spch_unk_7B6B
		jmp	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_unk_7B6B:
		fcb   5
		fcb $FF
; ---------------------------------------------------------------------------

Spch_loc_7B6D:
		ldd	#Spch_unk_7B73
		jmp	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_unk_7B73:
		fcb $FE, 7, $FF
; ---------------------------------------------------------------------------

Spch_loc_7B76:
		ldd	#Spch_unk_7B7C
		jmp	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_unk_7B7C:
		fcb 6, $FF
; ---------------------------------------------------------------------------

Spch_loc_7B7E:
		ldd	#Spch_unk_7B84
		jmp	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_unk_7B84:
		fcb $A,	3, $A, $FF
; ---------------------------------------------------------------------------

Spch_loc_7B88:
		ldd	#Spch_unk_7B8E
		jmp	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_unk_7B8E:
		fcb 1, $FF
; ---------------------------------------------------------------------------

Spch_loc_7B90:
		ldd	#Spch_byte_7B96
		jmp	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7B96:
		fcb $A,	4, $A, $FF
; ---------------------------------------------------------------------------

Spch_loc_7B9A:
		ldx	#Spch_byte_7BA0
		jmp	loc_7C31

; ---------------------------------------------------------------------------
Spch_byte_7BA0:
		fcb $B,	8, $FF
; ---------------------------------------------------------------------------

Spch_loc_7BA3:
		ldd	#Spch_byte_7BA9
		jmp	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7BA9:
		fcb 2, $FF
; ---------------------------------------------------------------------------

Spch_loc_7BAB:
		ldd	#Spch_byte_7BB1
		jmp	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7BB1:
		fcb $10, $FF
; ---------------------------------------------------------------------------

Spch_loc_7BB3:
		ldd	#Spch_byte_7BB8
		bra	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7BB8:
		fcb $F,	$FF
; ---------------------------------------------------------------------------

Spch_loc_7BBA:
		ldd	#Spch_byte_7BBF
		bra	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7BBF:
		fcb $F,	$10, $FF
; ---------------------------------------------------------------------------

Spch_loc_7BC2:
		ldd	#Spch_byte_7BC7
		bra	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7BC7:
		fcb $A,	$C, $A,	$FF
; ---------------------------------------------------------------------------

Spch_loc_7BCB:
		ldd	#Spch_byte_7BD0
		bra	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7BD0:
		fcb $A,	$E, $A,	$FF
; ---------------------------------------------------------------------------

Spch_loc_7BD4:
		ldd	#Spch_byte_7BD9
		bra	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7BD9:
		fcb $11, $FF
; ---------------------------------------------------------------------------

Spch_loc_7BDB:
		ldx	#Spch_byte_7BE0
		bra	loc_7C31

; ---------------------------------------------------------------------------
Spch_byte_7BE0:
		fcb $FE, $13, $FF
; ---------------------------------------------------------------------------

Spch_loc_7BE3:
		ldx	#Spch_byte_7BE8
		bra	loc_7C31

; ---------------------------------------------------------------------------
Spch_byte_7BE8:
		fcb $FE, $FE, $FE, $FE,	$FE, $FE, $FE, $14, $FF
; ---------------------------------------------------------------------------

Spch_loc_7BF1:
		ldx	#Spch_byte_7BF6
		bra	loc_7C31

; ---------------------------------------------------------------------------
Spch_byte_7BF6:
		fcb $16, $FF
; ---------------------------------------------------------------------------

Spch_loc_7BF8:
		ldd	#Spch_byte_7BFD
		bra	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7BFD:
		fcb $17, $FF
; ---------------------------------------------------------------------------

Spch_loc_7BFF:
		ldd	#Spch_byte_7C04
		bra	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7C04:
		fcb 9, $FF
; ---------------------------------------------------------------------------

Spch_loc_7C06:
		ldx	#Spch_byte_7C0B
		bra	loc_7C31

; ---------------------------------------------------------------------------
Spch_byte_7C0B:
		fcb $D,	$FF
; ---------------------------------------------------------------------------

Spch_loc_7C0D:
		ldx	#Spch_byte_7C12
		bra	loc_7C31

; ---------------------------------------------------------------------------
Spch_byte_7C12:
		fcb $12, $FF
; ---------------------------------------------------------------------------

Spch_loc_7C14:
		ldd	#Spch_byte_7C19
		bra	Spch_loc_7C1E

; ---------------------------------------------------------------------------
Spch_byte_7C19:
		fcb $15, $FF
; ---------------------------------------------------------------------------

Spch_loc_7C1B:
		ldd	#0


Spch_loc_7C1E:
		std	<DPbyte_1B
		ldb	<DPbyte_1E
		incb
		andb	#$F
		stb	<DPbyte_1E
		aslb
		ldx	#Sound_State_1
		abx
		ldd	<DPbyte_1B
		std	,x
		rts

; End of function Spch_sub_7B65

; ---------------------------------------------------------------------------
; START	OF FUNCTION CHUNK FOR Spch_sub_7B65

loc_7C31:
		ldb	<DPbyte_1E
		cmpb	<DPbyte_1D
		bne	locret_7C3F

		ldb	<DPbyte_20
		bne	locret_7C3F

		tfr	x, d
		bra	Spch_loc_7C1E

; ---------------------------------------------------------------------------

locret_7C3F:
		rts

; END OF FUNCTION CHUNK	FOR Spch_sub_7B65

; =============== S U B	R O U T	I N E =======================================


sub_7C40:
		ldb	<DPbyte_1E
		stb	<DPbyte_1D
		rts

; End of function sub_7C40


; =============== S U B	R O U T	I N E =======================================


Spch_sub_7C45:
		lda	#0
		sta	<DPbyte_1D
		sta	<DPbyte_1E
		sta	<DPbyte_16


Spch_loc_7C4D:
		lda	#$FF
		sta	<DPbyte_1F
		lda	<DPbyte_1D
		anda	#$F
		sta	<DPbyte_1D
		lda	<DPbyte_1E
		anda	#$F
		sta	<DPbyte_1E
		rts

; End of function Spch_sub_7C45


; =============== S U B	R O U T	I N E =======================================


Speech_Function_1:
		lda	<DPbyte_1F
		beq	Spch_loc_7C9C


Speech_Reset:
		bpl	Spch_loc_7C83

		asla
		bpl	Spch_loc_7C73

		lda	<DPbyte_80
		ora	#$23 ; '#'
		sta	<DPbyte_80
		lda	#$FF
		sta	<DPbyte_82
		bra	Spch_loc_7C79

; ---------------------------------------------------------------------------

Spch_loc_7C73:
		lda	<DPbyte_80
		anda	#$DF ; 'ß'
		sta	<DPbyte_80


Spch_loc_7C79:
		dec	<DPbyte_1F
		bmi	Spch_loc_7C81

		lda	#$28 ; '('
		sta	<DPbyte_1F


Spch_loc_7C81:
		bra	Spch_locret_7C9B

; ---------------------------------------------------------------------------

Spch_loc_7C83:
		lda	<DPbyte_80
		ora	#3
		sta	<DPbyte_80
		lda	#$FF
		sta	<DPbyte_82
		lda	<DPbyte_80
		anda	#$FE ; 'þ'
		sta	<DPbyte_80
		dec	<DPbyte_1F
		bne	Spch_locret_7C9B

		lda	#0
		sta	<DPbyte_20


Spch_locret_7C9B:
		rts

; ---------------------------------------------------------------------------

Spch_loc_7C9C:
		lda	<DPbyte_80
		anda	#4
		beq	Speech_Notspeaking


Speech_Speaking_Wait:
		lda	<DPbyte_A
		anda	#3
		bne	Spch_loc_7CAE

		inc	<DPbyte_16
		lbmi	Spch_loc_7C4D


Spch_loc_7CAE:
		jmp	Spch_locret_7D43

; ---------------------------------------------------------------------------

Speech_Notspeaking:
		lda	#0
		sta	<DPbyte_16
		lda	<DPbyte_80
		ora	#3
		sta	<DPbyte_80
		lda	<DPbyte_20
		bne	Speech_Speaking

		lda	<DPbyte_15
		beq	Spch_loc_7CC8

		dec	<DPbyte_15
		jmp	Spch_locret_7D43

; ---------------------------------------------------------------------------

Spch_loc_7CC8:
		ldb	<DPbyte_1D
		cmpb	<DPbyte_1E
		beq	Spch_locret_7D43

		incb
		andb	#$F
		stb	<DPbyte_1D
		aslb
		ldx	#Sound_State_1
		ldd	b,x
		std	<DPbyte_19
		lbeq	Spch_loc_7C4D

		lda	#3
		sta	<DPbyte_20
		rts

; ---------------------------------------------------------------------------

Speech_Speaking:
		cmpa	#2
		bne	Spch_loc_7D03

		ldx	<ptr5220Speech_Data_Start
		lda	,x+
		sta	<DPbyte_82
		lda	<DPbyte_80
		anda	#$FE ; 'þ'
		sta	<DPbyte_80
		stx	<ptr5220Speech_Data_Start
		cmpx	<DPptr5220Speech_Data_End
		bne	Spch_locret_7D43


Spch_loc_7CFA:
		lda	#1
		sta	<DPbyte_20
		lda	#$80 ; '€'
		sta	<DPbyte_15
		rts

; ---------------------------------------------------------------------------

Spch_loc_7D03:
		bcs	Spch_loc_7D3B

		ldx	<DPbyte_19
		ldb	,x+
		stx	<DPbyte_19
		cmpb	#$FE ; 'þ'
		bcs	Speech_Select_Phrase

		beq	Spch_loc_7CFA

		clr	<DPbyte_20
		lda	#$FF
		sta	<DPbyte_15
		rts

; ---------------------------------------------------------------------------

Speech_Select_Phrase:
		ldx	#SpchTab
		abx
		abx
		abx
		abx
		cmpx	#SpchTab+$60
		lbcc	Spch_sub_7C45

		ldd	,x
		std	<ptr5220Speech_Data_Start
		ldd	2,x
		std	<DPptr5220Speech_Data_End
		lda	#$60 ; '`'
		sta	<DPbyte_82
		lda	<DPbyte_80
		anda	#$FE ; 'þ'
		sta	<DPbyte_80
		dec	<DPbyte_20
		rts

; ---------------------------------------------------------------------------

Spch_loc_7D3B:
		dec	<DPbyte_15
		bne	Spch_locret_7D43

		lda	#3
		sta	<DPbyte_20


Spch_locret_7D43:
		rts

; End of function Speech_Function_1
