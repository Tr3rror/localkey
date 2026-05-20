/**
 * ColorPickerModal
 * Place at: src/components/ColorPickerModal.tsx
 *
 * Requires the wheel picker:
 *   npx expo install react-native-wheel-color-picker
 *   cd android && ./gradlew clean && cd .. && npx expo run:android
 *
 * Faithful port of the color picker from the other project, adapted to
 * LocalKey's ThemeContext (uses colors.accent instead of colors.primary,
 * no i18n dependency).
 */

import { useTheme } from '@/components/ThemeContext';
import React, { useState } from 'react';
import {
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ColorPicker from 'react-native-wheel-color-picker';

const { width } = Dimensions.get('window');

interface Props {
  label: string;
  currentColor: string;
  onSelect: (color: string) => void;
  labelColor?: string;      // color of the label text (WYSIWYG)
  containerColor?: string;  // background of the row (WYSIWYG)
}

export function ColorPickerModal({
  label,
  currentColor,
  onSelect,
  labelColor,
  containerColor,
}: Props) {
  const { colors } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [tempColor, setTempColor]       = useState(currentColor);

  const resolvedLabel     = labelColor     ?? colors.text;
  const resolvedContainer = containerColor ?? colors.card;

  const handleConfirm = () => {
    onSelect(tempColor);
    setModalVisible(false);
  };

  return (
    <View style={[
      styles.pickerRow,
      {
        backgroundColor: resolvedContainer,
        borderColor: resolvedLabel + '33',
        borderWidth: 1,
      },
    ]}>
      <Text style={[styles.pickerLabel, { color: resolvedLabel }]}>{label}</Text>

      <TouchableOpacity
        onPress={() => {
          setTempColor(currentColor);
          setModalVisible(true);
        }}
        style={[styles.previewCircle, {
          backgroundColor: currentColor,
          borderColor: resolvedLabel + '44',
        }]}
      />

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{label}</Text>

            <View style={styles.wheelWrapper}>
              <ColorPicker
                color={tempColor}
                onColorChangeComplete={c => setTempColor(c)}
                thumbSize={30}
                sliderSize={30}
                noSnap={true}
                row={false}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.text + '15' }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.accent }]}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderRadius: 20,
    marginBottom: 8,
  },
  pickerLabel:   { fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  previewCircle: { width: 45, height: 45, borderRadius: 22.5, borderWidth: 2, elevation: 3 },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent:  { width: width * 0.9, height: 480, borderRadius: 30, padding: 25, alignItems: 'center', elevation: 10 },
  modalTitle:    { fontSize: 20, fontWeight: '900', marginBottom: 10 },
  wheelWrapper:  { width: '100%', flex: 1, marginBottom: 20 },
  buttonRow:     { flexDirection: 'row', gap: 10, width: '100%' },
  btn:           { flex: 1, paddingVertical: 15, borderRadius: 15, alignItems: 'center' },
  cancelText:    { fontWeight: 'bold' },
  confirmText:   { color: '#FFF', fontWeight: 'bold' },
});